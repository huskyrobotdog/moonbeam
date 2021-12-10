import Keyring from "@polkadot/keyring";
import { expect } from "chai";
import { BN } from "@polkadot/util";
import {
  ALITH,
  ALITH_PRIV_KEY,
  BALTATHAR,
  GENESIS_ACCOUNT,
  GENESIS_ACCOUNT_PRIVATE_KEY,
  GLMR,
  relayChainAddress,
} from "../util/constants";
import { execFromAllMembersOfTechCommittee } from "../util/governance";

import { describeDevMoonbeam } from "../util/setup-dev-tests";
import { createBlockWithExtrinsic } from "../util/substrate-rpc";
import { createTransfer } from "../util/transactions";
import { getAccountPayable, VESTING_PERIOD } from "./test-crowdloan";
import { mockAssetBalance } from "./test-precompile/test-precompile-assets-erc20";

const TEST_ACCOUNT = "0x1111111111111111111111111111111111111111";

// A call from root (sudo) can make a transfer directly in pallet_evm
// A signed call cannot make a transfer directly in pallet_evm

describeDevMoonbeam("Pallet Maintenance Mode - normal call shouldnt work", (context) => {
  let events;
  before("Try turning maintenance mode on", async () => {
    const keyring = new Keyring({ type: "ethereum" });
    const alith = await keyring.addFromUri(ALITH_PRIV_KEY, null, "ethereum");
    ({ events } = await createBlockWithExtrinsic(
      context,
      alith,
      context.polkadotApi.tx.maintenanceMode.enterMaintenanceMode()
    ));
  });

  it("should fail without sudo", async function () {
    expect(events[5].toHuman().method).to.eq("ExtrinsicFailed");
    expect(await context.web3.eth.getBalance(TEST_ACCOUNT)).to.equal("0");
  });
});
describeDevMoonbeam("Pallet Maintenance Mode - with sudo shouldn't work", (context) => {
  let events;
  before("Try turning maintenance mode on", async () => {
    const keyring = new Keyring({ type: "ethereum" });
    const alith = await keyring.addFromUri(ALITH_PRIV_KEY, null, "ethereum");

    ({ events } = await createBlockWithExtrinsic(
      context,
      alith,
      context.polkadotApi.tx.sudo.sudo(
        context.polkadotApi.tx.maintenanceMode.enterMaintenanceMode()
      )
    ));
  });

  it("shouldn't succeed with sudo", async function () {
    expect(events[3].toHuman().method).to.eq("ExtrinsicSuccess");
    expect((await context.polkadotApi.query.maintenanceMode.maintenanceMode()).toHuman()).to.equal(
      false
    );
  });
});

describeDevMoonbeam("Pallet Maintenance Mode - with council should work", (context) => {
  let events;
  before("Try turning maintenance mode on", async () => {
    const keyring = new Keyring({ type: "ethereum" });
    // go into Maintenance
    ({ events } = await execFromAllMembersOfTechCommittee(
      context,
      context.polkadotApi.tx.maintenanceMode.enterMaintenanceMode()
    ));
  });

  it("should succeed with council", async function () {
    expect(events[3].toHuman().method).to.eq("EnteredMaintenanceMode");
    expect((await context.polkadotApi.query.maintenanceMode.maintenanceMode()).toHuman()).to.equal(
      true
    );
  });
});
// Exit
describeDevMoonbeam("Pallet Maintenance Mode - exit mode", (context) => {
  let events;
  before("Try turning maintenance mode on", async () => {
    // go into Maintenance
    await execFromAllMembersOfTechCommittee(
      context,
      context.polkadotApi.tx.maintenanceMode.enterMaintenanceMode()
    );
    // exit maintenance
    ({ events } = await execFromAllMembersOfTechCommittee(
      context,
      context.polkadotApi.tx.maintenanceMode.resumeNormalOperation()
    ));
  });

  it("should succeed with council", async function () {
    expect(events[3].toHuman().method).to.eq("NormalOperationResumed");
    expect((await context.polkadotApi.query.maintenanceMode.maintenanceMode()).toHuman()).to.equal(
      false
    );
  });
});
describeDevMoonbeam(
  "Pallet Maintenance Mode - exit mode - make sure transfers are allowed again",
  (context) => {
    let events;
    before("Try turning maintenance mode on", async () => {
      // go into Maintenance
      await execFromAllMembersOfTechCommittee(
        context,
        context.polkadotApi.tx.maintenanceMode.enterMaintenanceMode()
      );
      // exit maintenance
      ({ events } = await execFromAllMembersOfTechCommittee(
        context,
        context.polkadotApi.tx.maintenanceMode.resumeNormalOperation()
      ));

      //try transfer
      await context.createBlock({
        transactions: [await createTransfer(context.web3, TEST_ACCOUNT, 512)],
      });
    });

    it("shouldn't succeed with maintenance on", async function () {
      expect(await context.web3.eth.getBalance(TEST_ACCOUNT)).to.equal("512");
    });
  }
);

describeDevMoonbeam("Pallet Maintenance Mode - normal exit call shouldnt work", (context) => {
  before("Try turning maintenance mode on", async () => {
    const keyring = new Keyring({ type: "ethereum" });
    const alith = await keyring.addFromUri(ALITH_PRIV_KEY, null, "ethereum");

    // go into Maintenance
    await execFromAllMembersOfTechCommittee(
      context,
      context.polkadotApi.tx.maintenanceMode.enterMaintenanceMode()
    );
    // and try to turn it off
    await createBlockWithExtrinsic(
      context,
      alith,
      context.polkadotApi.tx.maintenanceMode.resumeNormalOperation()
    );
  });

  it("should fail without sudo", async function () {
    expect((await context.polkadotApi.query.maintenanceMode.maintenanceMode()).toHuman()).to.equal(
      true
    );
  });
});

// pallets that should be desactivated with maintenance mode

describeDevMoonbeam(
  "Pallet Maintenance Mode - no balance transfer with maintenance mode",
  (context) => {
    let events;
    before("Try turning maintenance mode on", async () => {
      const keyring = new Keyring({ type: "ethereum" });
      const alith = await keyring.addFromUri(ALITH_PRIV_KEY, null, "ethereum");

      await execFromAllMembersOfTechCommittee(
        context,
        context.polkadotApi.tx.maintenanceMode.enterMaintenanceMode()
      );

      await context.createBlock({
        transactions: [await createTransfer(context.web3, TEST_ACCOUNT, 512)],
      });
    });

    it("shouldn't succeed with maintenance on", async function () {
      expect(await context.web3.eth.getBalance(TEST_ACCOUNT)).to.equal("0");
    });
  }
);

describeDevMoonbeam(
  "Pallet Maintenance Mode - evm transfer with maintenance mode works with sudo",
  (context) => {
    let events;
    before("Try turning maintenance mode on", async () => {
      const keyring = new Keyring({ type: "ethereum" });
      const alith = await keyring.addFromUri(ALITH_PRIV_KEY, null, "ethereum");

      await execFromAllMembersOfTechCommittee(
        context,
        context.polkadotApi.tx.maintenanceMode.enterMaintenanceMode()
      );

      ({ events } = await createBlockWithExtrinsic(
        context,
        alith,
        context.polkadotApi.tx.sudo.sudo(
          context.polkadotApi.tx.evm.call(
            ALITH,
            TEST_ACCOUNT,
            "0x0",
            100_000_000_000_000_000_000n,
            12_000_000n,
            1_000_000_000n,
            undefined
          )
        )
      ));
    });

    it("should succeed with maintenance on but with sudo", async function () {
      expect(events[11].toHuman().method).to.eq("ExtrinsicSuccess");
      expect(await context.web3.eth.getBalance(TEST_ACCOUNT)).to.equal(
        100_000_000_000_000_000_000n.toString()
      );
    });
  }
);

describeDevMoonbeam(
  "Pallet Maintenance Mode - no crowdloanRewards claim with maintenance mode",
  (context) => {
    let genesisAccount;
    before("Try turning maintenance mode on", async () => {
      const keyring = new Keyring({ type: "ethereum" });
      const alith = await keyring.addFromUri(ALITH_PRIV_KEY, null, "ethereum");
      genesisAccount = await keyring.addFromUri(GENESIS_ACCOUNT_PRIVATE_KEY, null, "ethereum");

      // turn maintenance on
      await execFromAllMembersOfTechCommittee(
        context,
        context.polkadotApi.tx.maintenanceMode.enterMaintenanceMode()
      );

      //init
      await context.polkadotApi.tx.sudo
        .sudo(
          context.polkadotApi.tx.crowdloanRewards.initializeRewardVec([
            [relayChainAddress, GENESIS_ACCOUNT, 3_000_000n * GLMR],
          ])
        )
        .signAndSend(alith);
      await context.createBlock();

      let initBlock = (await context.polkadotApi.query.crowdloanRewards.initRelayBlock()) as any;

      // Complete initialization
      await context.polkadotApi.tx.sudo
        .sudo(
          context.polkadotApi.tx.crowdloanRewards.completeInitialization(
            initBlock.toBigInt() + VESTING_PERIOD
          )
        )
        .signAndSend(alith);
      await context.createBlock();
    });

    it("shouldn't succeed with maintenance on", async function () {
      try {
        await createBlockWithExtrinsic(
          context,
          genesisAccount,
          context.polkadotApi.tx.crowdloanRewards.claim()
        );
      } catch (e) {
        expect(e.toString()).to.eq(
          "Error: 1010: Invalid Transaction: Transaction call is not expected"
        );
      }
    });
  }
);

describeDevMoonbeam(
  "Pallet Maintenance Mode - no assets transfer with maintenance mode",
  (context) => {
    let events, sudoAccount, assetId;
    before("Try turning maintenance mode on", async () => {
      const keyring = new Keyring({ type: "ethereum" });
      sudoAccount = await keyring.addFromUri(ALITH_PRIV_KEY, null, "ethereum");

      // turn maintenance on
      await execFromAllMembersOfTechCommittee(
        context,
        context.polkadotApi.tx.maintenanceMode.enterMaintenanceMode()
      );

      // We need to mint units with sudo.setStorage, as we dont have xcm mocker yet
      // And we need relay tokens for issuing a transaction to be executed in the relay
      const balance = context.polkadotApi.createType("Balance", 100000000000000);
      const assetBalance = context.polkadotApi.createType("PalletAssetsAssetBalance", {
        balance: balance,
      });

      assetId = context.polkadotApi.createType(
        "u128",
        new BN("42259045809535163221576417993425387648")
      );
      const assetDetails = context.polkadotApi.createType("PalletAssetsAssetDetails", {
        supply: balance,
      });

      await mockAssetBalance(context, assetBalance, assetDetails, sudoAccount, assetId, ALITH);

      // const contractData = await getCompiled("ERC20Instance");
      // iFace = new ethers.utils.Interface(contractData.contract.abi);
      // const { rawTx } = await createContract(context.web3, "ERC20Instance");
      // await context.createBlock({ transactions: [rawTx] });
      // crowdloanRewards.claim
    });

    it("shouldn't succeed with maintenance on", async function () {
      try {
        await createBlockWithExtrinsic(
          context,
          sudoAccount,
          context.polkadotApi.tx.assets.transfer(assetId, BALTATHAR, 1000)
        );
      } catch (e) {
        expect(e.toString()).to.eq(
          "Error: 1010: Invalid Transaction: Transaction call is not expected"
        );
      }
    });
  }
);
