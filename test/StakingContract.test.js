const path = require('path');
const fs = require('fs-extra');
const {
  BN,
  expectEvent,
  expectRevert,
} = require('@openzeppelin/test-helpers');

const {
  createPrivKETH2,
  createPubKeyETH2,
  createUserWithdrawal,
  createDepositData,
  sigDepositAgreements,
  createDepositDataRoot
} = require('./helpers/index');

// Get Contract ABI
const artifactDir = path.resolve(__dirname, '../artifacts');
const stakingABIPath = path.join(artifactDir, 'staking.abi');
const stakingRawABIData = fs.readFileSync(stakingABIPath, 'utf-8');
const stakingContractABI = JSON.parse(stakingRawABIData);

const depositABIPath = path.join(artifactDir, 'deposit.abi');
const depositRawABIData = fs.readFileSync(depositABIPath, 'utf-8');
const depositContractABI = JSON.parse(depositRawABIData)
// Get Contract ByteCode
const stakingBytecodePath = path.join(artifactDir, 'staking.bytecode');
const stakingContractByteCode = fs.readFileSync(stakingBytecodePath, 'utf-8');
const depositBytecodePath = path.join(artifactDir, 'deposit.bytecode');
const depositContractByteCode = fs.readFileSync(depositBytecodePath, 'utf-8');

let depositContractAddress;


const StakingContract = async (web3) => {

  const deploy = async ({
    from: account
  }) => {
    // 
    const depositContract = new web3.eth.Contract(depositContractABI, {
      from: account,
    });
    const depositContractDeployer = depositContract.deploy({
      data: depositContractByteCode.replace(/(\r\n|\n|\r)/gm, ""),
      arguments: [],
    })
    const depositContractDeployed = await depositContractDeployer.send({
      from: account,
      gas: 7000000,
      gasPrice: '100',
    })
    depositContractAddress = depositContractDeployed._address
    const stakingContract = new web3.eth.Contract(stakingContractABI, {
      from: account,
    });
    const stakingContractDeployer = stakingContract.deploy({
      data: stakingContractByteCode.replace(/(\r\n|\n|\r)/gm, ""),
      arguments: [depositContractAddress],
    });
    const stakingDeployedContract = await stakingContractDeployer.send({
      from: account,
      gas: 7000000,
      gasPrice: '100',
    });
    return stakingDeployedContract;
  };

  return {
    deploy,
  };
};


contract('StakingContract', function (accounts) {
  // ETH1 accounts
  let owner = accounts[0]
  let user1_EOA = accounts[1];
  let user2_EOA = accounts[2];
  let user3_EOA = accounts[3];
  let user4_EOA = accounts[4];
  let user5_EOA = accounts[5];
  // ETH 2 accounts
  let user1_privKeth2, user1_pubKeth2, user1_wCred;
  let user2_privKeth2, user2_pubKeth2, user2_wCred;
  let user3_privKeth2, user3_pubKeth2, user3_wCred;
  let user4_privKeth2, user4_pubKeth2, user4_wCred;
  let user5_privKeth2, user5_pubKeth2, user5_wCred;

  let Staking = {};
  let instance;
  before(async () => {
    Staking = await StakingContract(web3);
  });
  describe("Sale & Renewal Module", function () {

    before(async () => {
      instance = await Staking.deploy({
        from: owner
      });
    })
    it("Owner deploy Staking Contract", async function () {
      const ownerAddress = await instance.methods.owner().call({
        from: owner
      });
      assert.equal(ownerAddress, owner)
    });

    it("Total units sold at deploy time is zero", async function () {
      const totalSold = await instance.methods.totalSubscriptions().call({
        from: owner
      });
      assert.equal(totalSold, 0)
    });

    it("User1 deposit 3.3 ETH to buy first subscription and the total units sold will be 1", async function () {
      user1_privKeth2 = createPrivKETH2();
      user1_pubKeth2 = createPubKeyETH2(user1_privKeth2);
      user1_wCred = createUserWithdrawal(user1_pubKeth2);
      await instance.methods.buyNewSubs(1, user1_pubKeth2).send({
        from: user1_EOA,
        value: web3.utils.toWei('3.3', "ether"),
        gas: 3000000
      })
      const totalSold = await instance.methods.totalSubscriptions().call({
        from: owner
      });
      assert.equal(totalSold, 1)
    });

    it("User1 deposit 3.3*4 ETH to buy 4 more subscription and the total subcriptions of user1 will be 5", async function () {
      await instance.methods.buyNewSubs(4, user1_pubKeth2).send({
        from: user1_EOA,
        value: web3.utils.toWei('13.2', "ether"),
        gas: 3000000
      })
      const numOfSubs = await instance.methods.getNumOfSubs(user1_EOA).call({
        from: owner
      });
      assert.equal(numOfSubs, 5)
    });

    it("Total units sold now will be 5", async function () {
      const totalSold = await instance.methods.totalSubscriptions().call({
        from: owner
      });
      assert.equal(totalSold, 5)
    });

    it("Get all subcriptions id by subcriber", async function () {

      const subIDArray = await instance.methods.getSubs(user1_EOA).call({
        from: owner
      });
    });

    it("If user send invalid amount ETH to buy (!= 3.3 ETH for each), tx will get Revert by the evm", async function () {
      await expectRevert.unspecified(
        instance.methods.buyNewSubs(1, user1_pubKeth2).send({
          from: user1_EOA,
          value: web3.utils.toWei('3.33', "ether"),
          gas: 3000000
        }),
        'Value of ETH is invalid'
      );
    });

    it("User1 renew 3 subs with id 1,2,3", async function () {
      await instance.methods.renewSubs([1, 2, 3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]).send({
        from: user1_EOA,
        value: web3.utils.toWei('0.3', "ether"),
        gas: 3000000
      });
      let sub1Time = await instance.methods.subsTime(1, 1).call({
        from: owner
      }) // 1 is subscriberID of user1
      let sub2Time = await instance.methods.subsTime(1, 2).call({
        from: owner
      })
      let sub3Time = await instance.methods.subsTime(1, 3).call({
        from: owner
      })
      assert.equal(sub1Time, sub2Time)
      assert.equal(sub1Time, sub3Time)
      assert.equal(sub3Time, 24)
    });

    it("User1 renew 4 subs with id 2,3, 5,4 without sort", async function () {
      await instance.methods.renewSubs([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 4, 0, 0, 0, 3, 0, 0, 0, 2, 0, 0, 0, 0, 5, 0, 0, 0, 0, 0, 0]).send({
        from: user1_EOA,
        value: web3.utils.toWei('0.4', "ether"),
        gas: 3000000
      });
      let sub4Time = await instance.methods.subsTime(1, 4).call({
        from: owner
      }) // 1 is subscriberID of user1
      let sub5Time = await instance.methods.subsTime(1, 5).call({
        from: owner
      })
      let sub2Time = await instance.methods.subsTime(1, 2).call({
        from: owner
      })
      let sub3Time = await instance.methods.subsTime(1, 3).call({
        from: owner
      })
      assert.equal(sub4Time, 24)
      assert.equal(sub4Time, sub5Time)
      assert.equal(sub2Time, 36)
      assert.equal(sub2Time, sub3Time)
    });

    it("User2 renew 3 subs with id 1,2,3 but user2 is not valid subcribers", async function () {
      await expectRevert.unspecified(
        instance.methods.renewSubs([1, 2, 3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]).send({
          from: user2_EOA,
          value: web3.utils.toWei('0.3', "ether"),
          gas: 3000000
        }),
        'User 2 is not valid subcribers');
    });

    it("Fee Pool is correct", async function () {
      let feePool = await instance.methods.getFeePool().call({
        from: owner
      });
      let feeInwei = web3.utils.toWei('1.2', "ether") // Total 5 subs + 7 renew
      assert.equal(feeInwei, feePool)
    });

    it("LockUp Pool is correct", async function () {
      let lockUpPool = await instance.methods.getLockUpPool().call({
        from: owner
      });
      let lockUpInwei = web3.utils.toWei('16', "ether") // Total 5 subs = 3.2 * 5
      assert.equal(lockUpInwei, lockUpPool)
    });

    it("User2 deposit 3.3*4 ETH to buy 4 subscription and the total subcriptions of user2 will be 4", async function () {
      user2_privKeth2 = createPrivKETH2();
      user2_pubKeth2 = createPubKeyETH2(user2_privKeth2);
      user2_wCred = createUserWithdrawal(user2_pubKeth2);
      await instance.methods.buyNewSubs(4, user2_pubKeth2).send({
        from: user2_EOA,
        value: web3.utils.toWei('13.2', "ether"),
        gas: 3000000
      })
      const numOfSubs = await instance.methods.getNumOfSubs(user2_EOA).call({
        from: owner
      });
      assert.equal(numOfSubs, 4)
    });

    it("User3 deposit 3.3*2 ETH to buy 2 subscription and the total subcriptions of user3 will be 2", async function () {
      user3_privKeth2 = createPrivKETH2();
      user3_pubKeth2 = createPubKeyETH2(user3_privKeth2);
      user3_wCred = createUserWithdrawal(user3_pubKeth2);
      await instance.methods.buyNewSubs(2, user3_pubKeth2).send({
        from: user3_EOA,
        value: web3.utils.toWei('6.6', "ether"),
        gas: 3000000
      })
      const numOfSubs = await instance.methods.getNumOfSubs(user3_EOA).call({
        from: owner
      });
      assert.equal(numOfSubs, 2)
    });

    it("User4 deposit 3.3*4 ETH to buy 4 subscription and the total subcriptions of user4 will be 4", async function () {
      user4_privKeth2 = createPrivKETH2();
      user4_pubKeth2 = createPubKeyETH2(user4_privKeth2);
      user4_wCred = createUserWithdrawal(user4_pubKeth2);
      await instance.methods.buyNewSubs(4, user4_pubKeth2).send({
        from: user4_EOA,
        value: web3.utils.toWei('13.2', "ether"),
        gas: 3000000
      })
      const numOfSubs = await instance.methods.getNumOfSubs(user4_EOA).call({
        from: owner
      });
      assert.equal(numOfSubs, 4)
    });
    it("User5 deposit 3.3*3 ETH to buy 3 subscription and the total subcriptions of user5 will be 3", async function () {
      user5_privKeth2 = createPrivKETH2();
      user5_pubKeth2 = createPubKeyETH2(user5_privKeth2);
      user5_wCred = createUserWithdrawal(user5_pubKeth2);
      await instance.methods.buyNewSubs(3, user5_pubKeth2).send({
        from: user5_EOA,
        value: web3.utils.toWei('9.9', "ether"),
        gas: 3000000
      })
      const numOfSubs = await instance.methods.getNumOfSubs(user5_EOA).call({
        from: owner
      });
      assert.equal(numOfSubs, 3)
    });
    it("Total units sold now should be 18", async function () {
      const totalSold = await instance.methods.totalSubscriptions().call({
        from: owner
      });
      assert.equal(totalSold, 18)
    });
  });

  describe("Allocations module", function () {
    it("Owner allocate subscriptions 1 and can not allocate subId 1 one more time", async function () {
      const validatorPrivK1 = createPrivKETH2();
      const validatorPubK1 = createPubKeyETH2(validatorPrivK1);
      const sig = sigDepositAgreements(validatorPrivK1, validatorPubK1, user1_wCred, 3200000000);
      const depositDataRoot = createDepositDataRoot(validatorPubK1, user1_wCred, 3200000000, sig);
      var depositDataBuffer = [validatorPubK1, user1_wCred, sig, depositDataRoot];
      var depositData = Buffer.concat(depositDataBuffer);
      const receipt = await instance.methods.allocationSubs(
        depositData,
        [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
      ).send({
        from: owner,
        gas: 3000000
      });

      expectEvent(receipt, 'AllocationReceipt', {
        user: user1_EOA,
        subId: '1',
        userPubkey: '0x' + user1_pubKeth2.toString('hex'),
        nodeKey: '0x' + validatorPubK1.toString('hex')
      });

      await expectRevert.unspecified(
        instance.methods.allocationSubs(
          depositData,
          [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
        ).send({
          from: owner,
          gas: 3000000
        }), 'Subcriptions 1 already allocated'
      )
    });

    it("After allocate successfull, Check LockUpPool Balance", async function () {
      let lockUpPool = await instance.methods.getLockUpPool().call({
        from: owner
      });
      let lockUpInwei = web3.utils.toWei('54.4', "ether") // Total 18 subs = 3.2 * 18 , allocate 1 subs => 16-3.2 = 12.8
      assert.equal(lockUpInwei, lockUpPool)
    });

    it("Balance of Deposit contract now is 3.2", async function () {
      const depositBalance = await web3.eth.getBalance(depositContractAddress);
      let depositBalanceInwei = web3.utils.toWei('3.2', "ether")
      assert.equal(depositBalance, depositBalanceInwei)
    });

    it("Deposit Count of Deposit contract now is 1 in bytes 8", async function () {
      const depositContract = new web3.eth.Contract(depositContractABI, depositContractAddress);
      const depositCount = await depositContract.methods.get_deposit_count().call({
        from: owner
      });
      assert.equal(depositCount, '0x0100000000000000');
    });

    it("Owner allocate subscriptions 2 to 5", async function () {
      // Subscription 2 of user 1
      const validatorPrivK2 = createPrivKETH2();
      const validatorPubK2 = createPubKeyETH2(validatorPrivK2);
      const sig2 = sigDepositAgreements(validatorPrivK2, validatorPubK2, user1_wCred, 3200000000);
      const depositDataRoot2 = createDepositDataRoot(validatorPubK2, user1_wCred, 3200000000, sig2);

      //Subscription 3 of user 1
      const validatorPrivK3 = createPrivKETH2();
      const validatorPubK3 = createPubKeyETH2(validatorPrivK3);
      const sig3 = sigDepositAgreements(validatorPrivK3, validatorPubK3, user1_wCred, 3200000000);
      const depositDataRoot3 = createDepositDataRoot(validatorPubK3, user1_wCred, 3200000000, sig3);

      //Subscription 4 of user 1
      const validatorPrivK4 = createPrivKETH2();
      const validatorPubK4 = createPubKeyETH2(validatorPrivK4);
      const sig4 = sigDepositAgreements(validatorPrivK4, validatorPubK4, user1_wCred, 3200000000);
      const depositDataRoot4 = createDepositDataRoot(validatorPubK4, user1_wCred, 3200000000, sig4);

      //Subscription 5 of user 1
      const validatorPrivK5 = createPrivKETH2();
      const validatorPubK5 = createPubKeyETH2(validatorPrivK5);
      const sig5 = sigDepositAgreements(validatorPrivK5, validatorPubK5, user1_wCred, 3200000000);
      const depositDataRoot5 = createDepositDataRoot(validatorPubK5, user1_wCred, 3200000000, sig5);

      //Subscription 6 of user 2
      const validatorPrivK6 = createPrivKETH2();
      const validatorPubK6 = createPubKeyETH2(validatorPrivK6);
      const sig6 = sigDepositAgreements(validatorPrivK6, validatorPubK6, user2_wCred, 3200000000);
      const depositDataRoot6 = createDepositDataRoot(validatorPubK6, user2_wCred, 3200000000, sig6);

      //Subscription 7 of user 2
      const validatorPrivK7 = createPrivKETH2();
      const validatorPubK7 = createPubKeyETH2(validatorPrivK7);
      const sig7 = sigDepositAgreements(validatorPrivK7, validatorPubK7, user2_wCred, 3200000000);
      const depositDataRoot7 = createDepositDataRoot(validatorPubK7, user2_wCred, 3200000000, sig7);

      //Subscription 8 of user 2
      const validatorPrivK8 = createPrivKETH2();
      const validatorPubK8 = createPubKeyETH2(validatorPrivK8);
      const sig8 = sigDepositAgreements(validatorPrivK8, validatorPubK8, user2_wCred, 3200000000);
      const depositDataRoot8 = createDepositDataRoot(validatorPubK8, user2_wCred, 3200000000, sig8);

      //Subscription 9 of user 2
      const validatorPrivK9 = createPrivKETH2();
      const validatorPubK9 = createPubKeyETH2(validatorPrivK9);
      const sig9 = sigDepositAgreements(validatorPrivK9, validatorPubK9, user2_wCred, 3200000000);
      const depositDataRoot9 = createDepositDataRoot(validatorPubK9, user2_wCred, 3200000000, sig9);

      var depositDataBuffer = [validatorPubK2, user1_wCred, sig2, depositDataRoot2,
        validatorPubK3, user1_wCred, sig3, depositDataRoot3,
        validatorPubK4, user1_wCred, sig4, depositDataRoot4,
        validatorPubK5, user1_wCred, sig5, depositDataRoot5,
        validatorPubK6, user2_wCred, sig6, depositDataRoot6,
        validatorPubK7, user2_wCred, sig7, depositDataRoot7,
        validatorPubK8, user2_wCred, sig8, depositDataRoot8,
        validatorPubK9, user2_wCred, sig9, depositDataRoot9
      ];
      var depositData = Buffer.concat(depositDataBuffer);
      await instance.methods.allocationSubs(
        depositData,
        [2, 3, 4, 5, 6, 7, 8, 9, 0, 0, 0, 0, 0, 0, 0, 0]
      ).send({
        from: owner,
        gas: 3000000
      });
    });

    it("Balance of Deposit contract now is 28.8", async function () {
      const depositBalance = await web3.eth.getBalance(depositContractAddress);
      let depositBalanceInwei = web3.utils.toWei('28.8', "ether")
      assert.equal(depositBalance, depositBalanceInwei)
    });

    it("Deposit Count of Deposit contract now is 9 in bytes 8", async function () {
      const depositContract = new web3.eth.Contract(depositContractABI, depositContractAddress);
      const depositCount = await depositContract.methods.get_deposit_count().call({
        from: owner
      });
      assert.equal(depositCount, '0x0900000000000000');
    });

    it("LockUp Pool now equal to 41.6 ether ", async function () {
      let lockUpPool = await instance.methods.getLockUpPool().call({
        from: owner
      });
      let lockUpInwei = web3.utils.toWei('28.8', "ether") // Total 18 subs = 3.2 * 18 - 9 subs allocate
      assert.equal(lockUpInwei, lockUpPool)
    });
  });

  describe("Collect Fee module", function () {
    it("Contract owner withdraw first month, feePool now equal to 1.8 + 0.7  - 0.1512 (18 subs sold, 7 renew )", async function () {
      await instance.methods.collectWithdrawFee().send({
        from: owner
      });
      let feePool = await instance.methods.getFeePool().call({
        from: owner
      });
      let feePoolInwei = web3.utils.toWei('2.3488', "ether");
      assert.equal(feePoolInwei, feePool)
    });

    it("Only owner can call `collectWithdrawFee` function to collect fee", async function () {
      await expectRevert.unspecified(
        instance.methods.collectWithdrawFee().send({
          from: accounts[1]
        }),
        'Only owner can call this functions'
      )
    });
  });

  describe("Cancellation & Rebate module", function () {

    it("User 1 cancel all their own subs [1,2,3,4,5] ", async function () {
      /**
       * SubId  2, 3 is 36 months // 0.6
       * SubId 1, 4, 5 is 24 months // 0.6
       * Total months passed is 1 month from start date
       * => Get refund 1.158, feePool equal to 1.1908
       */
      await instance.methods.cancellationSubs([1, 2, 3, 4, 5, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]).send({
        from: user1_EOA,
        gas: 7000000
      });
      let feePool = await instance.methods.getFeePool().call({
        from: owner
      });
      let feePoolInwei = web3.utils.toWei('1.1908', "ether");
      assert.equal(feePool, feePoolInwei)
    });

    it("User 2 cancel subscription id 10 will be revert by the evm cause user 2 not valid subs's owner ", async function () {
      await expectRevert.unspecified(
        instance.methods.cancellationSubs([10, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]).send({
          from: user2_EOA,
          gas: 7000000
        }),
        'Subscriber can only cancel their own subscriptions');
    });

    it("User 2 cancel subscription id 6,7, FeePool now equal to 1.0076 ( 1.1908 - (0.1 - 0.0084) * 2)", async function () {
      await instance.methods.cancellationSubs([6, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 7]).send({
        from: user2_EOA,
        gas: 7000000
      });
      let feePool = await instance.methods.getFeePool().call({
        from: owner
      });
      let feePoolInwei = web3.utils.toWei('1.0076', "ether");
      assert.equal(feePool, feePoolInwei)
    });
  });
});
