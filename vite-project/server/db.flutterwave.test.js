import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, test } from "node:test";

const dataDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "panda-flw-ledger-"));
process.env.DATA_DIR = dataDirectory;

const {
  claimVirtualAccountSlot,
  createUser,
  default: db,
  getUserById,
  listDepositsForAdmin,
  listDepositsForUser,
  listVirtualAccountsForAdmin,
  markWebhookProcessed,
  recordConfirmedDeposit,
  recordUnconfirmedDeposit,
  recordWebhookEvent,
  saveVirtualAccountDetails,
} = await import("./db.js");

after(() => {
  db.close();
  fs.rmSync(dataDirectory, { recursive: true, force: true });
});

test("pending verified deposit can settle once with exact ledger balances", () => {
  const user = createUser({
    name: "Ada Lovelace",
    email: `flw-${crypto.randomUUID()}@example.test`,
    passwordHash: "test-hash",
  });
  const txRef = `PN-${crypto.randomUUID()}`;
  const claim = claimVirtualAccountSlot({
    userId: user.id,
    mode: "test",
    customerEmail: user.email,
    pendingRef: txRef,
  });
  assert.equal(claim.claimed, true);

  const account = saveVirtualAccountDetails(user.id, {
    accountNumber: "1234567890",
    bankName: "Flutterwave MFB",
    accountName: "",
    narration: "Test account",
    kind: "PERMANENT",
    status: "ACTIVE",
    orderRef: "provider-order-ref",
    txRef,
    flwRef: "provider-reference",
  });
  assert.equal(account.txRef, txRef);

  recordUnconfirmedDeposit({
    account,
    mode: "test",
    transactionId: 90001,
    amount: 1250,
    currency: "NGN",
    status: "PENDING",
    providerStatus: "pending",
  });
  assert.equal(getUserById(user.id).walletBalance, 0);

  const settled = recordConfirmedDeposit({
    account,
    mode: "test",
    transactionId: 90001,
    amount: 1250,
    currency: "NGN",
    providerStatus: "successful",
    txRef,
    flwRef: "provider-reference",
  });
  assert.equal(settled.ok, true);
  assert.equal(settled.alreadyApplied, false);
  assert.equal(settled.balance, 1250);
  assert.equal(getUserById(user.id).walletBalance, 1250);

  const replay = recordConfirmedDeposit({
    account,
    mode: "test",
    transactionId: 90001,
    amount: 1250,
    currency: "NGN",
    providerStatus: "successful",
    txRef,
    flwRef: "provider-reference",
  });
  assert.equal(replay.alreadyApplied, true);
  assert.equal(getUserById(user.id).walletBalance, 1250);

  const history = listDepositsForUser(user.id);
  assert.equal(history.total, 1);
  assert.equal(history.deposits[0].status, "CREDITED");
  assert.equal(history.deposits[0].previousBalance, 0);
  assert.equal(history.deposits[0].newBalance, 1250);
  assert.equal(history.deposits[0].txRef, txRef);

  assert.equal(listVirtualAccountsForAdmin({ search: user.email }).total, 1);
  const adminDeposits = listDepositsForAdmin({
    status: "CREDITED",
    search: txRef,
  });
  assert.equal(adminDeposits.total, 1);
  assert.equal(adminDeposits.items[0].newBalance, 1250);

  recordWebhookEvent({
    provider: "flutterwave",
    eventKey: "charge.completed:90001",
    payload: { type: "charge.completed", transactionId: 90001 },
  });
  markWebhookProcessed("charge.completed:90001", "SUCCESS");
});
