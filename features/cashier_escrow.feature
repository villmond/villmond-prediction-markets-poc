Feature: P2P Cashier escrow
  The Mina zkApp must prove a Cashier's VILCOIN bond is locked, released
  only on a valid signature, forfeited automatically after a timeout, and
  arbitrable on dispute — with no on-chain re-entrance once settled (PRD 6,
  6.1, threat FUNC-01).

  Background:
    Given a deployed cashier escrow contract between a cashier, a user, and an arbiter

  Scenario: The cashier locks a bond for the trade
    When the cashier locks a bond of 10000 VILCOIN with deadline slot 1000
    Then the escrow holds 10000 VILCOIN
    And locking a second bond while active is rejected

  Scenario: The cashier releases the bond after an in-person handover
    Given the cashier has locked a bond of 10000 VILCOIN with deadline slot 1000
    When the cashier releases the bond
    Then the escrow is settled
    And the user receives 10000 VILCOIN

  Scenario: Release signed by an impostor is rejected
    Given the cashier has locked a bond of 10000 VILCOIN with deadline slot 1000
    When an impostor tries to release the bond
    Then the release attempt is rejected

  Scenario: A timeout slash is rejected before the deadline
    Given the cashier has locked a bond of 10000 VILCOIN with deadline slot 1000000
    When anyone tries to slash the bond on timeout
    Then the slash attempt is rejected

  Scenario: A timeout slash forfeits the bond to the user once the deadline passes
    Given the cashier has locked a bond of 10000 VILCOIN with deadline slot 0
    When anyone tries to slash the bond on timeout
    Then the escrow is settled
    And the user receives 10000 VILCOIN

  Scenario: The arbiter resolves a dispute in favor of the user
    Given the cashier has locked a bond of 10000 VILCOIN with deadline slot 1000
    When the arbiter resolves the dispute in favor of the user
    Then the escrow is settled
    And the user receives 10000 VILCOIN

  Scenario: Arbiter resolution signed by a non-designated key is rejected
    Given the cashier has locked a bond of 10000 VILCOIN with deadline slot 1000
    When an impostor tries to resolve the dispute in favor of the user
    Then the dispute resolution attempt is rejected
