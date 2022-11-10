import { ethers, BigNumber } from "ethers";
type LockSettings = {
  timestamp: BigNumber;
  power: BigNumber;
  locktime: BigNumber;
};

const VP_MULTIPLIER = BigNumber.from("1000000000000000000"); //1e18
function calcVP(time: BigNumber, input: LockSettings): BigNumber {
  const { timestamp, power, locktime } = input;
  if (time.gte(locktime)) {
    // pass lock time so user should withdraw if has a balance
    return BigNumber.from(0);
  }
  return locktime
    .sub(time)
    .mul(power)
    .mul(VP_MULTIPLIER)
    .div(locktime.sub(timestamp));
}

function main() {
  const time = BigNumber.from("1667952274");
  const vp = calcVP(time, {
    locktime: BigNumber.from("1793836800"),
    power: BigNumber.from("500000000000000000"),
    timestamp: BigNumber.from("1667947295"),
  });
  console.log(vp.toString());
}

main();
