// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/**
 * @title MentionRegistry
 * @notice Stores mention counts reported by Chainlink CRE workflows
 * @dev This contract would be deployed on Sepolia/mainnet and called by CRE
 */
contract MentionRegistry {
    // ============================================================
    // STATE
    // ============================================================

    /// @notice Mapping from term hash to mention count
    mapping(bytes32 => uint256) public mentionCounts;

    /// @notice Mapping from term hash to last update timestamp
    mapping(bytes32 => uint256) public lastUpdated;

    /// @notice Mapping from term hash to historical counts (timestamp => count)
    mapping(bytes32 => mapping(uint256 => uint256)) public historicalCounts;

    /// @notice Authorized reporter addresses (CRE DON addresses)
    mapping(address => bool) public authorizedReporters;

    /// @notice Owner of the contract
    address public owner;

    // ============================================================
    // EVENTS
    // ============================================================

    event MentionsReported(
        bytes32 indexed termHash,
        uint256 count,
        uint256 timestamp,
        address reporter
    );

    event ReporterAuthorized(address indexed reporter);
    event ReporterRevoked(address indexed reporter);

    // ============================================================
    // MODIFIERS
    // ============================================================

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    modifier onlyAuthorized() {
        require(authorizedReporters[msg.sender] || msg.sender == owner, "Not authorized");
        _;
    }

    // ============================================================
    // CONSTRUCTOR
    // ============================================================

    constructor() {
        owner = msg.sender;
    }

    // ============================================================
    // EXTERNAL FUNCTIONS
    // ============================================================

    /**
     * @notice Report mention count for a search term
     * @param termHash Keccak256 hash of the search term
     * @param count Number of mentions found
     * @param timestamp Unix timestamp of the search
     */
    function reportMentions(
        bytes32 termHash,
        uint256 count,
        uint256 timestamp
    ) external onlyAuthorized {
        mentionCounts[termHash] = count;
        lastUpdated[termHash] = timestamp;
        historicalCounts[termHash][timestamp] = count;

        emit MentionsReported(termHash, count, timestamp, msg.sender);
    }

    /**
     * @notice Get the current mention count for a term
     * @param termHash Keccak256 hash of the search term
     * @return Current mention count
     */
    function getMentionCount(bytes32 termHash) external view returns (uint256) {
        return mentionCounts[termHash];
    }

    /**
     * @notice Get the last update timestamp for a term
     * @param termHash Keccak256 hash of the search term
     * @return Unix timestamp of last update
     */
    function getLastUpdate(bytes32 termHash) external view returns (uint256) {
        return lastUpdated[termHash];
    }

    /**
     * @notice Get historical mention count at a specific timestamp
     * @param termHash Keccak256 hash of the search term
     * @param timestamp Unix timestamp to query
     * @return Mention count at that timestamp
     */
    function getHistoricalCount(
        bytes32 termHash,
        uint256 timestamp
    ) external view returns (uint256) {
        return historicalCounts[termHash][timestamp];
    }

    // ============================================================
    // ADMIN FUNCTIONS
    // ============================================================

    /**
     * @notice Authorize an address to report mentions
     * @param reporter Address to authorize
     */
    function authorizeReporter(address reporter) external onlyOwner {
        authorizedReporters[reporter] = true;
        emit ReporterAuthorized(reporter);
    }

    /**
     * @notice Revoke authorization from an address
     * @param reporter Address to revoke
     */
    function revokeReporter(address reporter) external onlyOwner {
        authorizedReporters[reporter] = false;
        emit ReporterRevoked(reporter);
    }

    /**
     * @notice Transfer ownership
     * @param newOwner New owner address
     */
    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "Invalid address");
        owner = newOwner;
    }
}
