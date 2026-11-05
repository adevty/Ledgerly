"use client";

import React, { use } from "react";
import { CheckoutPortal } from "../_checkout-portal";

export default function PublicCheckoutPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <CheckoutPortal initialRequestId={id} />;
}
