Feature: Zero-app onboarding
  As a newcomer to villmond-prediction-markets-poc, I want to start using the
  platform instantly, without installing any app, browser extension, or
  creating a password (PRD 2.2, 5.2).

  Scenario: A first-time visitor gets a fresh cryptographic identity
    When a new visitor's client generates an identity
    Then the visitor receives a valid "nsec" private key
    And the visitor receives a valid "npub" public key

  Scenario: A power user recovers their identity from a backed-up nsec
    Given a visitor has previously generated an identity
    When the visitor imports their backed-up "nsec" on a new device
    Then the recovered identity's public key matches the original

  Scenario: The platform loads its white-label configuration
    When the client loads the root configuration
    Then new users start with the configured initial VILCOIN balance
    And the configured token is named "VILCOIN"
