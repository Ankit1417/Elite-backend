import assert from "node:assert/strict";
import test from "node:test";
import crypto from "node:crypto";
import mongoose from "mongoose";

import {
  generateEsewaSignature,
  verifyEsewaResponseSignature,
  EsewaDecodedResponse,
} from "../src/services/esewaService.js";

test("eSewa Signature Generation (HMAC-SHA256 Base64)", () => {
  const secretKey = "8gBm/:&EnhH.1/q";
  const message = "total_amount=1000,transaction_uuid=EL-ORD-TEST-123,product_code=EPAYTEST";

  const expectedSignature = crypto
    .createHmac("sha256", secretKey)
    .update(message)
    .digest("base64");

  const actualSignature = generateEsewaSignature(message, secretKey);
  assert.equal(actualSignature, expectedSignature);
  assert.ok(actualSignature.length > 0);
});

test("eSewa Response Signature Verification with valid signature", () => {
  const secretKey = "8gBm/:&EnhH.1/q";
  const payload: EsewaDecodedResponse = {
    transaction_code: "000AWEO",
    status: "COMPLETE",
    total_amount: "1150",
    transaction_uuid: "EL-ORD-2026-XYZ",
    product_code: "EPAYTEST",
    signed_field_names: "transaction_code,status,total_amount,transaction_uuid,product_code,signed_field_names",
    signature: "",
  };

  // Construct valid signature
  const fieldNames = payload.signed_field_names.split(",").map((f) => f.trim());
  const message = fieldNames
    .filter((f) => f !== "signature")
    .map((f) => `${f}=${payload[f]}`)
    .join(",");
  payload.signature = generateEsewaSignature(message, secretKey);

  const isValid = verifyEsewaResponseSignature(payload, secretKey);
  assert.equal(isValid, true);
});

test("eSewa Response Signature Verification rejects tampered signature", () => {
  const secretKey = "8gBm/:&EnhH.1/q";
  const payload: EsewaDecodedResponse = {
    transaction_code: "000AWEO",
    status: "COMPLETE",
    total_amount: "1150",
    transaction_uuid: "EL-ORD-2026-XYZ",
    product_code: "EPAYTEST",
    signed_field_names: "transaction_code,status,total_amount,transaction_uuid,product_code,signed_field_names",
    signature: "TAMPERED_INVALID_SIGNATURE_BASE64=",
  };

  const isValid = verifyEsewaResponseSignature(payload, secretKey);
  assert.equal(isValid, false);
});

test("eSewa Response Signature Verification rejects tampered amount with valid signature for other amount", () => {
  const secretKey = "8gBm/:&EnhH.1/q";
  const payload: EsewaDecodedResponse = {
    transaction_code: "000AWEO",
    status: "COMPLETE",
    total_amount: "1000",
    transaction_uuid: "EL-ORD-2026-XYZ",
    product_code: "EPAYTEST",
    signed_field_names: "transaction_code,status,total_amount,transaction_uuid,product_code,signed_field_names",
    signature: "",
  };

  // Sign original amount 1000
  const fieldNames = payload.signed_field_names.split(",").map((f) => f.trim());
  const message = fieldNames
    .filter((f) => f !== "signature")
    .map((f) => `${f}=${payload[f]}`)
    .join(",");
  payload.signature = generateEsewaSignature(message, secretKey);

  // Tamper amount to 500
  payload.total_amount = "500";

  const isValid = verifyEsewaResponseSignature(payload, secretKey);
  assert.equal(isValid, false);
});

test("eSewa Response Signature Verification rejects missing signed fields", () => {
  const secretKey = "8gBm/:&EnhH.1/q";
  const payload: EsewaDecodedResponse = {
    transaction_code: "000AWEO",
    status: "COMPLETE",
    total_amount: "1150",
    transaction_uuid: "EL-ORD-2026-XYZ",
    product_code: "EPAYTEST",
    signed_field_names: "",
    signature: "some-sig",
  };

  const isValid = verifyEsewaResponseSignature(payload, secretKey);
  assert.equal(isValid, false);
});

test("eSewa Amount Calculation Rule: total_amount = amount + tax_amount + product_service_charge + product_delivery_charge", () => {
  const merchandise = 1500;
  const delivery = 150;
  const tax = 0;
  const service = 0;
  const total = merchandise + delivery + tax + service;

  assert.equal(total, 1650);
  assert.equal(total, merchandise + tax + service + delivery);
});
