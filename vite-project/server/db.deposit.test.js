import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, test } from "node:test";

const dataDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "panda-neurapay-ledger-"));
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

test("a confirmed NeuraPay deposit settles once and preserves exact ledger balances", () => {
  const user = createUser({
    name: "Ada Lovelace",
    email: `np-${crypto.randomUUID()}@example.test`,
    passwordHash: "test-hash",
  });
  const txRef = `PN-${crypto.randomUUID()}`;
  const claim = claimVirtualAccountSlot({
    userId: user.id,
    provider: "neurapay",
    mode: "test",
    customerEmail: user.email,
    pendingRef: txRef,
  });
  assert.equal(claim.claimed, true);

  const account = saveVirtualAccountDetails(user.id, {
    provider: "neurapay",
    accountNumber: "1234567890",
    bankName: "Paga",
    accountName: user.name,
    narration: "",
    kind: "PERMANENT",
    status: "ACTIVE",
    orderRef: txRef,
    txRef,
    providerReference: "account-provider-reference",
  });
  assert.equal(account.txRef, txRef);
  assert.equal(account.provider, "neurapay");

  recordUnconfirmedDeposit({
    account,
    provider: "neurapay",
    mode: "test",
    transactionId: "TXN-90001",
    amount: 1250,
    currency: "NGN",
    status: "PENDING",
    providerStatus: "pending",
  });
  assert.equal(getUserById(user.id).walletBalance, 0);

  const settled = recordConfirmedDeposit({
    account,
    provider: "neurapay",
    mode: "test",
    transactionId: "TXN-90001",
    amount: 1250,
    currency: "NGN",
    providerStatus: "successful",
    txRef: "TXN-90001",
    providerReference: "provider-reference",
  });
  assert.equal(settled.ok, true);
  assert.equal(settled.alreadyApplied, false);
  assert.equal(settled.balance, 1250);
  assert.equal(getUserById(user.id).walletBalance, 1250);

  const replay = recordConfirmedDeposit({
    account,
    provider: "neurapay",
    mode: "test",
    transactionId: "TXN-90001",
    amount: 1250,
    currency: "NGN",
    providerStatus: "successful",
    txRef: "TXN-90001",
    providerReference: "provider-reference",
  });
  assert.equal(replay.alreadyApplied, true);
  assert.equal(getUserById(user.id).walletBalance, 1250);

  const history = listDepositsForUser(user.id);
  assert.equal(history.total, 1);
  assert.equal(history.deposits[0].status, "CREDITED");
  assert.equal(history.deposits[0].providerReference, "provider-reference");
  assert.equal(history.deposits[0].previousBalance, 0);
  assert.equal(history.deposits[0].newBalance, 1250);
  assert.equal(history.deposits[0].txRef, "TXN-90001");

  assert.equal(listVirtualAccountsForAdmin({ search: user.email }).total, 1);
  const adminDeposits = listDepositsForAdmin({
    status: "CREDITED",
    search: "TXN-90001",
  });
  assert.equal(adminDeposits.total, 1);
  assert.equal(adminDeposits.items[0].newBalance, 1250);

  recordWebhookEvent({
    provider: "neurapay",
    eventKey: "payment.successful:TXN-90001",
    payload: { type: "payment.successful", transactionId: "TXN-90001" },
  });
  markWebhookProcessed("payment.successful:TXN-90001", "SUCCESS");
});

test("separate providers and users can claim independent account slots", () => {
  const firstUser = createUser({
    name: "Grace Hopper",
    email: `np-a-${crypto.randomUUID()}@example.test`,
    passwordHash: "test-hash",
  });
  const secondUser = createUser({
    name: "Katherine Johnson",
    email: `np-b-${crypto.randomUUID()}@example.test`,
    passwordHash: "test-hash",
  });
  assert.equal(
    claimVirtualAccountSlot({
      userId: firstUser.id,
      provider: "neurapay",
      pendingRef: "NP-FIRST",
    }).claimed,
    true,
  );
  assert.equal(
    claimVirtualAccountSlot({
      userId: secondUser.id,
      provider: "neurapay",
      pendingRef: "NP-SECOND",
    }).claimed,
    true,
  );
  assert.equal(
    claimVirtualAccountSlot({
      userId: firstUser.id,
      provider: "legacy-provider",
      pendingRef: "OLD-FIRST",
    }).claimed,
    true,
  );
});
