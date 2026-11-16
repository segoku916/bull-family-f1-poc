// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
/// @notice Minimal stand-in for BullAgreement used ONLY to prove the SDK-side check gap:
/// it emits the real AgreementCreated event with whatever payee the caller passes.
/// The real Agreement contract's createAgreement has the same event signature.
contract MockAgreement {
    uint256 public nextId = 1;
    mapping(uint256 => address) public payeeOf;
    event AgreementCreated(uint256 indexed id, address indexed payer, address indexed payee, address asset, uint256 amount, uint64 expiry, bytes32 termsHash);
    function createAgreement(address payee, uint256 amount) external payable returns (uint256 id) {
        id = nextId++;
        payeeOf[id] = payee;
        emit AgreementCreated(id, msg.sender, payee, address(0), amount, uint64(block.timestamp + 72 hours), bytes32(0));
    }
}
