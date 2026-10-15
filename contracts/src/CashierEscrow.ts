import {
  Bool,
  Field,
  Provable,
  PublicKey,
  Signature,
  SmartContract,
  state,
  State,
  method,
  UInt32,
  UInt64,
  Struct,
} from "o1js";

/**
 * ZK escrow for the P2P Cashier network (PRD 6/6.1). One deployed instance
 * covers a single trade between a Cashier and a Standard User.
 *
 * VILCOIN is a closed-loop app credit, not a native Mina asset (PRD core
 * invariant), so — matching MarketSettlement's design — this contract
 * proves the escrow's state transitions and emits a tamper-evident
 * `settled` event; off-chain VILCOIN balance updates (signed Nostr events)
 * must follow the event's `recipient`/`amount`.
 *
 * POC simplification: a single `escrowAmount` field tracks the Cashier's
 * full locked bond (satisfying `cashier_module.min_cashier_stake` is an
 * off-chain/UI precondition, not enforced here). Timeout slashing forfeits
 * the entire bond to the user, rather than modeling a separate trade-value
 * vs. over-collateralized-stake split (PRD's "150% stake" example) — a
 * stricter, simpler policy appropriate for this POC's threat model
 * (FUNC-01). Dispute arbitration trusts a single arbiter signature, the
 * same simplification MarketSettlement makes for oracle resolution.
 */

/** Domain-separation selectors for the signed messages `release()`/`arbiterResolve()` verify. Exported so callers building those signatures (tests, BDD steps, the client) share one source of truth instead of re-declaring these magic numbers. */
export const RELEASE_SELECTOR: Field = Field(1);
export const ARBITER_SELECTOR: Field = Field(2);

type EscrowLockedEventShape = {
  cashierPublicKey: typeof PublicKey;
  userPublicKey: typeof PublicKey;
  amount: typeof UInt64;
  releaseDeadlineSlot: typeof UInt32;
};

const EscrowLockedEventStruct: ReturnType<typeof Struct<EscrowLockedEventShape>> = Struct({
  cashierPublicKey: PublicKey,
  userPublicKey: PublicKey,
  amount: UInt64,
  releaseDeadlineSlot: UInt32,
});

export class EscrowLockedEvent extends EscrowLockedEventStruct {}

type EscrowSettledEventShape = {
  outcome: typeof Field; // 1 = released by cashier, 2 = slashed on timeout, 3 = arbiter-resolved
  recipient: typeof PublicKey;
  amount: typeof UInt64;
};

const EscrowSettledEventStruct: ReturnType<typeof Struct<EscrowSettledEventShape>> = Struct({
  outcome: Field,
  recipient: PublicKey,
  amount: UInt64,
});

export class EscrowSettledEvent extends EscrowSettledEventStruct {}

const OUTCOME_RELEASED = Field(1);
const OUTCOME_SLASHED = Field(2);
const OUTCOME_ARBITER_RESOLVED = Field(3);

export class CashierEscrow extends SmartContract {
  @state(PublicKey) cashierPublicKey = State<PublicKey>();
  @state(PublicKey) userPublicKey = State<PublicKey>();
  @state(PublicKey) arbiterPublicKey = State<PublicKey>();
  @state(UInt64) escrowAmount = State<UInt64>();
  @state(UInt32) releaseDeadlineSlot = State<UInt32>();

  events = {
    locked: EscrowLockedEvent,
    settled: EscrowSettledEvent,
  };

  init() {
    super.init();
    this.escrowAmount.set(UInt64.zero);
    this.releaseDeadlineSlot.set(UInt32.zero);
  }

  /**
   * Locks the Cashier's bond for this trade. `escrowAmount` doubles as the
   * one-time guard: it is only ever zero before the first lock and after
   * final settlement, so a second lock attempt is rejected the same way a
   * late release/slash/resolve is.
   */
  @method async lockEscrow(
    cashierPublicKey: PublicKey,
    userPublicKey: PublicKey,
    arbiterPublicKey: PublicKey,
    amount: UInt64,
    releaseDeadlineSlot: UInt32,
  ) {
    this.escrowAmount.getAndRequireEquals().assertEquals(UInt64.zero);
    amount.assertGreaterThan(UInt64.zero);

    this.cashierPublicKey.set(cashierPublicKey);
    this.userPublicKey.set(userPublicKey);
    this.arbiterPublicKey.set(arbiterPublicKey);
    this.escrowAmount.set(amount);
    this.releaseDeadlineSlot.set(releaseDeadlineSlot);

    this.emitEvent("locked", new EscrowLockedEvent({ cashierPublicKey, userPublicKey, amount, releaseDeadlineSlot }));
  }

  /**
   * Cashier confirms the in-person/Zcash handover happened; releases the
   * bond to the user. The signed message includes this contract's own
   * address so a release signature cannot be replayed against a different
   * escrow sharing the same cashier and the same locked amount.
   */
  @method async release(cashierSignature: Signature) {
    const amount = this.escrowAmount.getAndRequireEquals();
    amount.assertGreaterThan(UInt64.zero);

    const cashierPublicKey = this.cashierPublicKey.getAndRequireEquals();
    cashierSignature
      .verify(cashierPublicKey, [RELEASE_SELECTOR, amount.value, this.address.x, this.address.isOdd.toField()])
      .assertTrue();

    const userPublicKey = this.userPublicKey.getAndRequireEquals();
    this.escrowAmount.set(UInt64.zero);

    this.emitEvent("settled", new EscrowSettledEvent({ outcome: OUTCOME_RELEASED, recipient: userPublicKey, amount }));
  }

  /** Anyone may trigger this once the deadline has passed; forfeits the bond to the user. */
  @method async timeoutSlash() {
    const amount = this.escrowAmount.getAndRequireEquals();
    amount.assertGreaterThan(UInt64.zero);

    const deadline = this.releaseDeadlineSlot.getAndRequireEquals();
    this.currentSlot.requireBetween(deadline, UInt32.MAXINT());

    const userPublicKey = this.userPublicKey.getAndRequireEquals();
    this.escrowAmount.set(UInt64.zero);

    this.emitEvent("settled", new EscrowSettledEvent({ outcome: OUTCOME_SLASHED, recipient: userPublicKey, amount }));
  }

  /**
   * Designated arbiter breaks a dispute, routing the bond to whichever
   * party it signs for. The signed message includes this contract's own
   * address for the same cross-escrow replay protection as `release()`.
   */
  @method async arbiterResolve(arbiterSignature: Signature, favorUser: Bool) {
    const amount = this.escrowAmount.getAndRequireEquals();
    amount.assertGreaterThan(UInt64.zero);

    const arbiterPublicKey = this.arbiterPublicKey.getAndRequireEquals();
    arbiterSignature
      .verify(arbiterPublicKey, [
        ARBITER_SELECTOR,
        favorUser.toField(),
        amount.value,
        this.address.x,
        this.address.isOdd.toField(),
      ])
      .assertTrue();

    const userPublicKey = this.userPublicKey.getAndRequireEquals();
    const cashierPublicKey = this.cashierPublicKey.getAndRequireEquals();
    const recipient = Provable.if(favorUser, PublicKey, userPublicKey, cashierPublicKey);

    this.escrowAmount.set(UInt64.zero);

    this.emitEvent("settled", new EscrowSettledEvent({ outcome: OUTCOME_ARBITER_RESOLVED, recipient, amount }));
  }
}
