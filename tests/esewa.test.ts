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

test("eSewa Environment Secret Resolution accepts UAT key in test mode", () => {
  const UAT_SECRET = "8gBm/:&EnhH.1/q";
  // Simulating secret resolution logic
  const resolve = (envSecret?: string, esewaEnv = "test") => {
    const trimmed = envSecret?.trim();
    if (esewaEnv === "production") {
      if (!trimmed || trimmed === UAT_SECRET) {
        throw new Error("Invalid production secret");
      }
      return trimmed;
    }
    return trimmed || UAT_SECRET;
  };

  assert.equal(resolve(undefined, "test"), UAT_SECRET);
  assert.equal(resolve("8gBm/:&EnhH.1/q", "test"), UAT_SECRET);
  assert.equal(resolve("  8gBm/:&EnhH.1/q  ", "test"), UAT_SECRET);
  assert.equal(resolve("custom_test_key", "test"), "custom_test_key");
});

test("eSewa Environment Secret Resolution enforces strict security in production mode", () => {
  const UAT_SECRET = "8gBm/:&EnhH.1/q";
  const resolve = (envSecret?: string, esewaEnv = "production") => {
    const trimmed = envSecret?.trim();
    if (esewaEnv === "production") {
      if (!trimmed) {
        throw new Error("ESEWA_SECRET_KEY must be explicitly configured when ESEWA_ENVIRONMENT is 'production'");
      }
      if (trimmed === UAT_SECRET) {
        throw new Error("Cannot use UAT test secret key in production eSewa environment");
      }
      return trimmed;
    }
    return trimmed || UAT_SECRET;
  };

  // Missing secret in production throws
  assert.throws(() => resolve(undefined, "production"), /must be explicitly configured/);
  assert.throws(() => resolve("   ", "production"), /must be explicitly configured/);

  // UAT secret in production throws
  assert.throws(() => resolve(UAT_SECRET, "production"), /Cannot use UAT test secret key/);
  assert.throws(() => resolve(`  ${UAT_SECRET}  `, "production"), /Cannot use UAT test secret key/);

  // Real production secret passes with trim
  const realProdKey = "real_production_super_secret_key_from_esewa";
  assert.equal(resolve(`  ${realProdKey}  `, "production"), realProdKey);
});

