import { ethers, BigNumber } from "ethers";
import { REFERRAL_VOLUMES } from "./query";
import { query } from "./utils";
import * as dotenv from "dotenv"; // see https://github.com/motdotla/dotenv#how-do-i-use-dotenv-with-import
import fetch from "cross-fetch";
import axios from "axios";
dotenv.config();
enum Tier {
  AMPLIFI1,
  AMPLIFI2,
  AMPLIFI3,
}

type BlockRange = {
  start: number;
  end: number;
};

type Reward = {
  status:
    | "claimed"
    | "unclaimed"
    | "expired"
    | "paid"
    | "paid externally"
    | "not paid"
    | "balance";
  type: "referee" | "referrer";
  description: string;
  creation: Date;
  amountNum?: string;
  amountUSD?: string;
  account: string;
  rewardToken: {
    chainId: number;
    address: string;
    name: string;
  };
};

async function fetchReferralVolumes(
  blockNumberRange: BlockRange,
  payoutId: string
) {
  const { data } = await query(REFERRAL_VOLUMES, {
    blockNumber_lt: blockNumberRange.end,
    blockNumber_gte: blockNumberRange.start,
    payoutId,
  });
  return data;
}

type AmpliFiReferralVolumes = {
  blockNumber: string;
  referralCode: string;
  volume: string;
  transactionHash: string;
  referral: string;
  referrerGMX: string;
  referrer: string;
  totalRebateUsdGMX: string;
  rebateUsdGMX: string;
  rebateUsd: BigNumber;
  discountUsd: BigNumber;
  referrerLagg: BigNumber;
  referralLagg: BigNumber;
};
// maps GMX rewards to AmpliFi rewards
function cleanAmpliFiReferralVolumes(
  referralVolumesData: any
): Array<AmpliFiReferralVolumes> {
  const cleanReferralVolumes = referralVolumesData.map(
    ({
      blockNumber,
      referralCode,
      volume,
      transactionHash,
      referral,
      referrer,
      oldReferrer,
      totalRebateUsd,
      discountUsd,
    }: any) => {
      let userTier = Tier.AMPLIFI1;
      const rebateUsdGMX = BigNumber.from(totalRebateUsd).sub(
        BigNumber.from(discountUsd)
      );
      let rebateUsd;
      if (oldReferrer == null) {
        throw (
          "Invalid referral code. Couldnt find the oldOwner for referral code: " +
          referralCode
        );
      }
      switch (userTier as Tier) {
        case Tier.AMPLIFI1:
          rebateUsd = rebateUsdGMX.div(BigNumber.from(2));
          return {
            blockNumber,
            referralCode,
            volume,
            transactionHash,
            referral,
            referrerGMX: referrer,
            referrer: oldReferrer,
            totalRebateUsdGMX: totalRebateUsd,
            rebateUsdGMX,
            rebateUsd: rebateUsd,
            discountUsd: BigNumber.from(discountUsd),
            referrerLagg: rebateUsd.div(BigNumber.from(2)).mul(1000).div(15),
            referralLagg: BigNumber.from(discountUsd)
              .mul(225)
              .div(100)
              .mul(1000)
              .div(15)
              .toString(),
          };
        case Tier.AMPLIFI2:
          rebateUsd = rebateUsdGMX
            .mul(BigNumber.from(10))
            .div(BigNumber.from(12));
          return {
            blockNumber,
            referralCode,
            volume,
            transactionHash,
            referral,
            referrerGMX: referrer,
            referrer: oldReferrer,
            totalRebateUsdGMX: totalRebateUsd,
            rebateUsdGMX,
            rebateUsd,
            discountUsd: BigNumber.from(discountUsd),
            referrerLagg: rebateUsd.div(BigNumber.from(10)).mul(1000).div(15),
            referralLagg: BigNumber.from(discountUsd)
              .mul(1125)
              .mul(1000)
              .div(15)
              .div(1000)
              .toString(),
          };
        case Tier.AMPLIFI3:
          rebateUsd = rebateUsdGMX;
          return {
            blockNumber,
            referralCode,
            volume,
            transactionHash,
            referral,
            referrerGMX: referrer,
            referrer: oldReferrer,
            totalRebateUsdGMX: totalRebateUsd,
            rebateUsd,
            rebateUsdGMX,
            discountUsd: BigNumber.from(discountUsd),
            referrerLagg: rebateUsd
              .mul(7375)
              .mul(1000)
              .div(150)
              .div(100)
              .div(15),
            referralLagg: BigNumber.from(discountUsd)
              .mul(5625)
              .mul(1000)
              .div(10000)
              .div(15)
              .toString(),
          };
        default:
          throw "Invalid tier " + userTier + "detected!";
      }
    }
  );
  return cleanReferralVolumes;
}

function mapAmpliFiReferralCodes(data: any): Map<string, string> {
  const codes = new Map<string, string>();
  data.forEach((data: any) => {
    if (data.code && data.oldOwner) {
      codes.set(data.code, data.oldOwner);
    }
  });
  return codes;
}

//aggregation
function reduceAmpliFiReferralVolumes(data: AmpliFiReferralVolumes[]) {
  const totals = data.reduce(
    (sum: any, res) => {
      if (
        res.referralCode !==
        // "0x7469657233746573740000000000000000000000000000000000000000000000"
        "0x72656765787068696c62696e0000000000000000000000000000000000000000" //regexphilpin
      ) {
        return sum;
      }
      const totalRebateUsdGMX = BigNumber.from(res.totalRebateUsdGMX).add(
        sum.totalRebateUsdGMX
      );
      const discountUsd = BigNumber.from(res.discountUsd).add(sum.discountUsd);
      const rebateUsd = BigNumber.from(res.rebateUsd).add(sum.rebateUsd);
      return {
        totalRebateUsdGMX,
        discountUsd,
        rebateUsd,
      };
    },
    {
      totalRebateUsdGMX: BigNumber.from(0),
      discountUsd: BigNumber.from(0),
      rebateUsd: BigNumber.from(0),
    }
  );
  console.log(totals);
  const totalReferrerRewardsUsd = totals.totalRebateUsdGMX - totals.discountUsd;
  console.log("rebates: ", totalReferrerRewardsUsd.toString());
}

function calculateRewards(
  referralVolumes: AmpliFiReferralVolumes[]
): Array<Reward> {
  const rewardsReferrerMap = new Map<
    string,
    { lagg: BigNumber; ethInUsd: BigNumber; account: string }
  >();
  const rewardsRefereeMap = new Map<
    string,
    { lagg: BigNumber; ethInUsd: BigNumber; account: string }
  >(); // referee only gets bonus LAGG
  const laggToken = {
    chainId: 42161,
    address: "",
    name: "LAGG",
  };
  const ethToken = {
    chainId: 42161,
    address: "0x82af49447d8a07e3bd95bd0d56f35241523fbab1",
    name: "WETH",
  };

  function addRewards(
    mapToadd: Map<
      string,
      { lagg: BigNumber; ethInUsd: BigNumber; account: string }
    >,
    address: string,
    ethInUsd: BigNumber,
    lagg: BigNumber
  ) {
    let rewards = mapToadd.get(address);
    if (rewards == null) {
      mapToadd.set(address, {
        ethInUsd: BigNumber.from(0),
        lagg: BigNumber.from(0),
        account: address,
      });
      rewards = mapToadd.get(address);
    }

    mapToadd.set(address, {
      ethInUsd: rewards!.ethInUsd.add(ethInUsd),
      lagg: rewards!.lagg.add(lagg),
      account: address,
    });
  }
  referralVolumes.forEach(
    ({
      referralLagg,
      referrerLagg,
      discountUsd,
      rebateUsd,
      referral,
      referrer,
      transactionHash,
    }) => {
      // console.log("referrer:", referrer);
      // console.log("referral:", referral);
      // console.log("txHash:", transactionHash);
      // console.log({
      //   referralLagg: ethers.utils.formatUnits(referralLagg, 30),
      //   referrerLagg: ethers.utils.formatUnits(referrerLagg, 30),
      //   discountUsd: ethers.utils.formatUnits(discountUsd, 30),
      //   rebateUsd: ethers.utils.formatUnits(rebateUsd, 30),
      // });
      addRewards(rewardsReferrerMap, referrer, rebateUsd, referrerLagg);
      addRewards(rewardsRefereeMap, referral, discountUsd, referralLagg);
    }
  );
  const rewards: Array<Reward> = [];
  const date = new Date();
  rewardsReferrerMap.forEach(({ ethInUsd, lagg, account }) => {
    rewards.push({
      type: "referrer",
      status: "not paid",
      description: "Affiliate - GMX reward ETH",
      creation: date,
      amountUSD: ethInUsd.toString(),
      rewardToken: ethToken,
      account,
    });
    rewards.push({
      type: "referrer",
      status: "balance",
      description: "Referrer - GMX reward LAGG",
      creation: date,
      amountNum: lagg.toString(),
      rewardToken: laggToken,
      account,
    });
  });
  rewardsRefereeMap.forEach(({ ethInUsd, lagg, account }) => {
    rewards.push({
      type: "referee",
      status: "paid externally",
      description: "User - GMX reward ETH",
      creation: date,
      amountUSD: ethInUsd.toString(),
      rewardToken: ethToken,
      account,
    });
    rewards.push({
      type: "referee",
      status: "balance",
      description: "User - GMX reward LAGG",
      creation: date,
      amountNum: lagg.toString(),
      rewardToken: laggToken,
      account,
    });
  });

  return rewards;
}

function fetchEthPrice() {
  // TODO: block time
  let response: any = null;
  return new Promise(async (resolve, reject) => {
    try {
      response = await axios.get(
        `https://api.etherscan.io/api?module=stats&action=ethprice&apikey=${process.env.ETHERSCAN_KEY}`
      );
    } catch (ex) {
      response = null;
      // error
      console.log(ex);
      reject(ex);
    }
    if (response) {
      // success
      const json = response.data;
      resolve(json.result.ethusd);
    }
  });
}

type BatchSenderTxParams = {
  eth: {
    accounts: string[];
    accountsStr: string;
    amount: string[];
    amountStr: string;
  };
  lagg: {
    accounts: string[];
    accountsStr: string;
    amount: string[];
    amountStr: string;
  };
};
function getTxParams(
  rewards: Array<Reward>,
  ethPrice: string
): BatchSenderTxParams {
  // do the payouts or at least send a list of payouts
  // const txParams = generateTxParams(rewards);
  const txParams: BatchSenderTxParams = {
    eth: {
      accounts: [],
      accountsStr: "",
      amount: [],
      amountStr: "",
    },
    lagg: {
      accounts: [],
      accountsStr: "",
      amount: [],
      amountStr: "",
    },
  };
  for (const reward of rewards) {
    if (reward.rewardToken.name == "WETH") {
      if (reward.amountUSD === undefined) {
        throw "ETH amount USD should not be undefined here. GMX tracks ETH in USD.";
      }
      if (reward.status == "paid" || reward.status == "paid externally") {
        continue;
      }
      const ethPrice100x = parseInt(
        (parseFloat(ethPrice) * 100).toString()
      ).toString();
      const eth = BigNumber.from(reward.amountUSD)
        .mul(100)
        .div(BigNumber.from(ethPrice100x))
        .div(1e12)
        .toString();
      txParams.eth.accounts.push(reward.account);
      txParams.eth.amount.push(eth);
    }
  }
  return txParams;
}

function checks(
  rawData: any,
  input: {
    cleanData: {
      referralVolumes: AmpliFiReferralVolumes[];
    };
    rewards: Reward[];
  }
) {
  // What was paid to AmpliFi should be exactly the total RebatesUsdGMX - total discountUsd
  const ethPaidToAmpliFi = BigNumber.from(rawData.distribution.amount);
  const usdAmpliFiRebates = rawData.referralVolumeRecords.reduce(
    (sum: any, { totalRebateUsd, discountUsd }: any) => {
      return sum.add(
        BigNumber.from(totalRebateUsd).sub(BigNumber.from(discountUsd))
      );
    },
    BigNumber.from(0)
  );
  const ethPrice = (
    usdAmpliFiRebates.div(ethPaidToAmpliFi).toString() / 1e12
  ).toFixed(2);

  const ethPrice100x = parseInt(
    (parseFloat(ethPrice) * 100).toString()
  ).toString();
  // Assuming everyone is tier 1, what AmpliFi pays out should be half of what was paid to AmpliFi
  let calculatedRewardsInETH = BigNumber.from("0");
  for (const reward of input.rewards) {
    if (reward.rewardToken.name == "WETH") {
      if (reward.status == "paid" || reward.status == "paid externally") {
        continue;
      }

      const eth = BigNumber.from(reward.amountUSD)
        .mul(100)
        .div(BigNumber.from(ethPrice100x))
        .div(1e12)
        .toString();
      calculatedRewardsInETH = calculatedRewardsInETH.add(eth);
    }
  }
  const ratio = usdAmpliFiRebates
    .mul("100")
    .div(calculatedRewardsInETH)
    .div(ethPrice100x);

  console.log(
    "Price of eth calculated (based on what was paid and assuming that we have the correct block numbers set:\n",
    ethPrice
  );
  console.log(
    "ratio between total rebates AmpliFi received to what is being paid out to AmpliFi affiliates:\n",
    ratio.toString() / 1e12
  );
}
async function main(blockNumberRange: BlockRange) {
  //data fetching
  const data = await fetchReferralVolumes(
    blockNumberRange,
    "0x6a03fa1df243abe7a46cf943de1b1e500285949c:0x7b16046156785b650f9d6c5e3416941b8baf3b449a61d5178ae1c65d09ee3128:300"
  );
  const ethPrice = (await fetchEthPrice()) as string;
  // cleaning data
  const referralVolumes = cleanAmpliFiReferralVolumes(
    data.referralVolumeRecords
  );
  // reduceAmpliFiReferralVolumes(referralVolumes);
  // calculate rewards
  const rewards = calculateRewards(referralVolumes);
  // TODO:  set rewards in database

  const txParams = getTxParams(rewards, "1354.41");
  console.log("txParams:", txParams);

  checks(data, {
    cleanData: {
      referralVolumes,
    },
    rewards,
  });

  //format rewards for transaction
  //approve
  //batchsend
  //TODO: add 1% meta promoter
  //check if on tier 2,3
}

const blockNumberRange = {
  start: 10595435,
  end: 36480533,
};

/*
table PayoutTime {
  blockNumber: number;
  payoutTxHash: string;
  campaignId: string;
}
*/

main(blockNumberRange);
