//! Ledgerly Escrow & Commitment Registry (`ledgerly-escrow`).
//!
//! Responsibilities:
//! 1. Hold NEP-141 stablecoin funds (USDC) in opaque escrows for merchant
//!    payments and cross-border remittances.
//! 2. Store 32-byte SHA-256 commitments of encrypted off-chain business
//!    payloads so auditors with a view key can verify tamper-evidence.
//! 3. Provide fail-safe user exits: depositors can always `claim_refund`
//!    after `refund_after` even if the backend is offline or the contract
//!    is paused (AD-2).
//! 4. Emit NEP-297 events without PII or business metadata.

use near_sdk::json_types::U128;
use near_sdk::store::{IterableSet, LookupMap};
use near_sdk::{
    env, ext_contract, near, require, AccountId, Gas, NearToken, PanicOnDefault, Promise,
    PromiseError, PromiseOrValue,
};

const GAS_FOR_FT_TRANSFER: Gas = Gas::from_tgas(15);
const GAS_FOR_CALLBACK: Gas = Gas::from_tgas(10);
const ONE_YOCTO: NearToken = NearToken::from_yoctonear(1);

#[ext_contract(ext_ft)]
pub trait FungibleToken {
    fn ft_transfer(&mut self, receiver_id: AccountId, amount: U128, memo: Option<String>);
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum EscrowKind {
    Payment,
    Remittance,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum EscrowStatus {
    Open,
    Held,
    Closed,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug)]
pub struct Escrow {
    pub kind: EscrowKind,
    pub depositor: Option<AccountId>,
    pub held: U128,
    /// Hex-encoded 32-byte SHA-256 commitment (`sha256(canonicalJSON(payload) || salt)`).
    pub commitment: String,
    pub status: EscrowStatus,
    /// Timestamp in nanoseconds after which `depositor` can call `claim_refund`.
    pub refund_after: u64,
}

/// JSON message passed inside `ft_transfer_call(..., msg)`.
#[near(serializers = [json])]
pub struct DepositMsg {
    pub escrow_id: String,
    pub kind: Option<EscrowKind>,
    pub commitment: Option<String>,
    pub refund_after: Option<u64>,
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct Contract {
    owner: AccountId,
    operators: IterableSet<AccountId>,
    token: AccountId,
    escrows: LookupMap<String, Escrow>,
    paused: bool,
}

#[near]
impl Contract {
    #[init]
    pub fn new(owner: AccountId, token: AccountId) -> Self {
        let mut operators = IterableSet::new(b"o");
        operators.insert(owner.clone());
        Self {
            owner,
            operators,
            token,
            escrows: LookupMap::new(b"e"),
            paused: false,
        }
    }

    // ------------------------------------------------------------------ Admin

    pub fn add_operator(&mut self, operator: AccountId) {
        self.assert_owner();
        self.operators.insert(operator);
    }

    pub fn remove_operator(&mut self, operator: AccountId) {
        self.assert_owner();
        self.operators.remove(&operator);
    }

    pub fn set_paused(&mut self, paused: bool) {
        self.assert_owner();
        self.paused = paused;
    }

    // --------------------------------------------------------- Escrow lifecycle

    /// Pre-register an escrow (used for merchant payment requests before a
    /// buyer pays). Remittances can also register inline via `ft_on_transfer`.
    pub fn register(
        &mut self,
        escrow_id: String,
        kind: EscrowKind,
        commitment: String,
        refund_after: u64,
    ) {
        self.assert_not_paused();
        self.assert_operator();
        Self::assert_valid_hex32(&escrow_id, "escrow_id");
        Self::assert_valid_hex32(&commitment, "commitment");
        require!(
            !self.escrows.contains_key(&escrow_id),
            "Escrow already exists"
        );
        require!(
            refund_after > env::block_timestamp(),
            "refund_after must be in the future"
        );

        let escrow = Escrow {
            kind,
            depositor: None,
            held: U128(0),
            commitment: commitment.clone(),
            status: EscrowStatus::Open,
            refund_after,
        };
        self.escrows.insert(escrow_id.clone(), escrow);
        Self::emit(
            "escrow_registered",
            &format!(r#"{{"escrow_id":"{}","commitment":"{}"}}"#, escrow_id, commitment),
        );
    }

    /// NEP-141 receiver hook. ONLY callable by the whitelisted `token` contract.
    ///
    /// Returns unused tokens as `U128`:
    /// - `U128(0)` when the deposit is accepted and held in escrow.
    /// - `amount` when the escrow is closed or invalid (NEP-141 automatically
    ///   refunds the sender in the same transaction).
    pub fn ft_on_transfer(
        &mut self,
        sender_id: AccountId,
        amount: U128,
        msg: String,
    ) -> PromiseOrValue<U128> {
        require!(
            env::predecessor_account_id() == self.token,
            "Only the configured stablecoin token may call ft_on_transfer"
        );
        require!(!self.paused, "Contract is paused");
        require!(amount.0 > 0, "Amount must be positive");

        let parsed: DepositMsg = match near_sdk::serde_json::from_str(&msg) {
            Ok(m) => m,
            Err(_) => return PromiseOrValue::Value(amount), // auto-refund malformed msg
        };

        let mut escrow = match self.escrows.get(&parsed.escrow_id).cloned() {
            Some(existing) => {
                if existing.status == EscrowStatus::Closed {
                    return PromiseOrValue::Value(amount); // auto-refund closed escrow
                }
                existing
            }
            None => {
                // Allow inline registration for Remittance if commitment + refund_after are provided
                let (Some(commitment), Some(refund_after)) =
                    (parsed.commitment, parsed.refund_after)
                else {
                    return PromiseOrValue::Value(amount); // unknown escrow -> auto-refund
                };
                if !Self::is_valid_hex32(&parsed.escrow_id)
                    || !Self::is_valid_hex32(&commitment)
                    || refund_after <= env::block_timestamp()
                {
                    return PromiseOrValue::Value(amount);
                }
                Escrow {
                    kind: parsed.kind.unwrap_or(EscrowKind::Remittance),
                    depositor: None,
                    held: U128(0),
                    commitment,
                    status: EscrowStatus::Open,
                    refund_after,
                }
            }
        };

        if escrow.depositor.is_none() {
            escrow.depositor = Some(sender_id);
        }
        escrow.held = U128(
            escrow
                .held
                .0
                .checked_add(amount.0)
                .expect("Escrow balance overflow"),
        );
        escrow.status = EscrowStatus::Held;
        self.escrows.insert(parsed.escrow_id.clone(), escrow);

        Self::emit(
            "escrow_funded",
            &format!(
                r#"{{"escrow_id":"{}","amount":"{}"}}"#,
                parsed.escrow_id, amount.0
            ),
        );
        PromiseOrValue::Value(U128(0))
    }

    /// Operator releases funds to `receiver` (merchant or off-ramp settlement account).
    /// State is decremented BEFORE the cross-contract call and restored in the
    /// callback if `ft_transfer` fails.
    pub fn release(&mut self, escrow_id: String, receiver: AccountId, amount: U128) -> Promise {
        self.assert_not_paused();
        self.assert_operator();
        self.debit_and_transfer(escrow_id, receiver, amount, "escrow_released")
    }

    /// Operator refunds funds back to the original `depositor`.
    pub fn refund(&mut self, escrow_id: String, amount: U128) -> Promise {
        self.assert_not_paused();
        self.assert_operator();
        let depositor = self
            .escrows
            .get(&escrow_id)
            .and_then(|e| e.depositor.clone())
            .expect("Escrow has no depositor");
        self.debit_and_transfer(escrow_id, depositor, amount, "escrow_refunded")
    }

    /// Fail-safe user exit (AD-2): the depositor can reclaim all remaining held
    /// funds once `refund_after` has elapsed — even if the contract is paused
    /// or all operators are offline.
    pub fn claim_refund(&mut self, escrow_id: String) -> Promise {
        let caller = env::predecessor_account_id();
        let escrow = self.escrows.get(&escrow_id).expect("Escrow not found");
        require!(
            escrow.depositor.as_ref() == Some(&caller),
            "Only the depositor can claim refund"
        );
        require!(
            env::block_timestamp() > escrow.refund_after,
            "Refund timeout has not elapsed yet"
        );
        let amount = escrow.held;
        require!(amount.0 > 0, "Nothing left to refund");
        self.debit_and_transfer(escrow_id, caller, amount, "escrow_refunded")
    }

    /// Anchor a periodic tamper-evident audit-log Merkle/chain root on-chain.
    pub fn anchor(&mut self, log_root: String) {
        self.assert_not_paused();
        self.assert_operator();
        Self::assert_valid_hex32(&log_root, "log_root");
        Self::emit("log_anchored", &format!(r#"{{"root":"{}"}}"#, log_root));
    }

    #[private]
    pub fn on_transfer_complete(
        &mut self,
        escrow_id: String,
        amount: U128,
        event_name: String,
        #[callback_result] call_result: Result<(), PromiseError>,
    ) {
        if call_result.is_ok() {
            Self::emit(
                &event_name,
                &format!(r#"{{"escrow_id":"{}","amount":"{}"}}"#, escrow_id, amount.0),
            );
        } else {
            // Roll back balance so funds are never lost on failed NEP-141 transfer
            if let Some(mut escrow) = self.escrows.get(&escrow_id).cloned() {
                escrow.held = U128(escrow.held.0.saturating_add(amount.0));
                escrow.status = EscrowStatus::Held;
                self.escrows.insert(escrow_id.clone(), escrow);
            }
            Self::emit(
                "transfer_failed",
                &format!(r#"{{"escrow_id":"{}","amount":"{}"}}"#, escrow_id, amount.0),
            );
        }
    }

    // ------------------------------------------------------------------ Views

    pub fn get_escrow(&self, escrow_id: String) -> Option<Escrow> {
        self.escrows.get(&escrow_id).cloned()
    }

    pub fn is_paused(&self) -> bool {
        self.paused
    }

    pub fn get_token(&self) -> AccountId {
        self.token.clone()
    }

    // --------------------------------------------------------------- Internal

    fn debit_and_transfer(
        &mut self,
        escrow_id: String,
        receiver: AccountId,
        amount: U128,
        event_name: &str,
    ) -> Promise {
        require!(amount.0 > 0, "Amount must be > 0");
        let mut escrow = self
            .escrows
            .get(&escrow_id)
            .cloned()
            .expect("Escrow not found");
        require!(escrow.held.0 >= amount.0, "Insufficient held balance");

        escrow.held = U128(escrow.held.0 - amount.0);
        if escrow.held.0 == 0 {
            escrow.status = EscrowStatus::Closed;
        }
        self.escrows.insert(escrow_id.clone(), escrow);

        ext_ft::ext(self.token.clone())
            .with_attached_deposit(ONE_YOCTO)
            .with_static_gas(GAS_FOR_FT_TRANSFER)
            .ft_transfer(receiver, amount, None)
            .then(
                Self::ext(env::current_account_id())
                    .with_static_gas(GAS_FOR_CALLBACK)
                    .on_transfer_complete(escrow_id, amount, event_name.to_string()),
            )
    }

    fn assert_owner(&self) {
        require!(
            env::predecessor_account_id() == self.owner,
            "Only owner may call this method"
        );
    }

    fn assert_operator(&self) {
        require!(
            self.operators.contains(&env::predecessor_account_id()),
            "Only an authorized operator may call this method"
        );
    }

    fn assert_not_paused(&self) {
        require!(!self.paused, "Contract is paused");
    }

    fn is_valid_hex32(s: &str) -> bool {
        s.len() == 64 && s.bytes().all(|b| b.is_ascii_hexdigit())
    }

    fn assert_valid_hex32(s: &str, field: &str) {
        require!(
            Self::is_valid_hex32(s),
            format!("{} must be 64 hex chars (32 bytes)", field)
        );
    }

    fn emit(event: &str, data_json: &str) {
        env::log_str(&format!(
            r#"EVENT_JSON:{{"standard":"ledgerly","version":"1.0.0","event":"{}","data":{}}}"#,
            event, data_json
        ));
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use near_sdk::test_utils::VMContextBuilder;
    use near_sdk::testing_env;

    const T0: u64 = 1_700_000_000_000_000_000;
    const ESCROW_ID: &str = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    const COMMIT: &str = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

    fn acc(s: &str) -> AccountId {
        s.parse().unwrap()
    }

    fn ctx(predecessor: &str, ts: u64) {
        let mut b = VMContextBuilder::new();
        b.predecessor_account_id(acc(predecessor))
            .current_account_id(acc("escrow.ledgerly.testnet"))
            .block_timestamp(ts);
        testing_env!(b.build());
    }

    fn setup() -> Contract {
        ctx("owner.testnet", T0);
        Contract::new(acc("owner.testnet"), acc("usdc.testnet"))
    }

    #[test]
    fn register_and_fund_merchant_payment_escrow() {
        let mut c = setup();
        c.register(
            ESCROW_ID.into(),
            EscrowKind::Payment,
            COMMIT.into(),
            T0 + 1_000,
        );

        ctx("usdc.testnet", T0 + 10);
        let res = c.ft_on_transfer(
            acc("buyer.testnet"),
            U128(120_000_000),
            format!(r#"{{"escrow_id":"{}"}}"#, ESCROW_ID),
        );
        assert!(matches!(res, PromiseOrValue::Value(U128(0))));

        let e = c.get_escrow(ESCROW_ID.into()).unwrap();
        assert_eq!(e.held.0, 120_000_000);
        assert_eq!(e.depositor, Some(acc("buyer.testnet")));
        assert_eq!(e.status, EscrowStatus::Held);
    }

    #[test]
    #[should_panic(expected = "Only the configured stablecoin token")]
    fn rejects_non_whitelisted_token_caller() {
        let mut c = setup();
        ctx("fake-token.testnet", T0);
        let _ = c.ft_on_transfer(
            acc("buyer.testnet"),
            U128(100),
            format!(r#"{{"escrow_id":"{}"}}"#, ESCROW_ID),
        );
    }

    #[test]
    fn unknown_or_closed_escrow_returns_full_amount_for_nep141_refund() {
        let mut c = setup();
        ctx("usdc.testnet", T0);
        let res = c.ft_on_transfer(
            acc("buyer.testnet"),
            U128(50_000_000),
            format!(r#"{{"escrow_id":"{}"}}"#, ESCROW_ID),
        );
        assert!(matches!(res, PromiseOrValue::Value(U128(50_000_000))));
    }

    #[test]
    fn release_and_refund_respect_deposited_cap_and_rollback_on_failure() {
        let mut c = setup();
        c.register(
            ESCROW_ID.into(),
            EscrowKind::Payment,
            COMMIT.into(),
            T0 + 1_000,
        );
        ctx("usdc.testnet", T0 + 10);
        let _ = c.ft_on_transfer(
            acc("buyer.testnet"),
            U128(130_000_000),
            format!(r#"{{"escrow_id":"{}"}}"#, ESCROW_ID),
        );

        // Refund excess 10 USDC, then release 120 USDC
        ctx("owner.testnet", T0 + 20);
        let _ = c.refund(ESCROW_ID.into(), U128(10_000_000));
        let _ = c.release(ESCROW_ID.into(), acc("merchant.testnet"), U128(120_000_000));

        let e = c.get_escrow(ESCROW_ID.into()).unwrap();
        assert_eq!(e.held.0, 0);
        assert_eq!(e.status, EscrowStatus::Closed);

        // Simulate callback failure -> balance restored
        ctx("escrow.ledgerly.testnet", T0 + 30);
        c.on_transfer_complete(
            ESCROW_ID.into(),
            U128(120_000_000),
            "escrow_released".into(),
            Err(PromiseError::Failed),
        );
        let restored = c.get_escrow(ESCROW_ID.into()).unwrap();
        assert_eq!(restored.held.0, 120_000_000);
        assert_eq!(restored.status, EscrowStatus::Held);
    }

    #[test]
    #[should_panic(expected = "Refund timeout has not elapsed yet")]
    fn claim_refund_before_timeout_fails() {
        let mut c = setup();
        c.register(
            ESCROW_ID.into(),
            EscrowKind::Remittance,
            COMMIT.into(),
            T0 + 1_000,
        );
        ctx("usdc.testnet", T0 + 10);
        let _ = c.ft_on_transfer(
            acc("sender.testnet"),
            U128(200_000_000),
            format!(r#"{{"escrow_id":"{}"}}"#, ESCROW_ID),
        );
        ctx("sender.testnet", T0 + 500);
        let _ = c.claim_refund(ESCROW_ID.into());
    }

    #[test]
    fn claim_refund_succeeds_after_timeout_even_when_paused() {
        let mut c = setup();
        c.register(
            ESCROW_ID.into(),
            EscrowKind::Remittance,
            COMMIT.into(),
            T0 + 1_000,
        );
        ctx("usdc.testnet", T0 + 10);
        let _ = c.ft_on_transfer(
            acc("sender.testnet"),
            U128(200_000_000),
            format!(r#"{{"escrow_id":"{}"}}"#, ESCROW_ID),
        );

        // Owner pauses contract
        ctx("owner.testnet", T0 + 20);
        c.set_paused(true);

        // Depositor can still exit after timeout (AD-2)
        ctx("sender.testnet", T0 + 1_001);
        let _ = c.claim_refund(ESCROW_ID.into());
        assert_eq!(c.get_escrow(ESCROW_ID.into()).unwrap().held.0, 0);
    }
}
