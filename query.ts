//TODO : add avalanche
const MULTISIG = {
  Arbitrum: "0x6a03fa1df243abe7a46cf943de1b1e500285949c",
  Avalanche: "",
};

export const REFERRAL_VOLUMES = `
query ReferralTrades ($blockNumber_lt: BigInt!, $blockNumber_gte: BigInt!, $payoutId: String!){
  referralVolumeRecords(
    where: {blockNumber_lt: $blockNumber_lt, blockNumber_gte:  $blockNumber_gte, referrer: "${MULTISIG.Arbitrum}"}
    orderBy: blockNumber
    orderDirection: desc
  ) {
    blockNumber
    referralCode
    volume
    transactionHash
    referral
    oldReferrer
    referrer
    totalRebateUsd
    discountUsd
  }
  distribution(
    id: $payoutId
  ) {
    id
    transactionHash
    typeId
    timestamp
    token
    amount
  }
}
`;
