# Deposit contract interface:
contract Validator_Registration:
    def get_deposit_root() -> bytes32: constant
    def get_deposit_count() -> bytes[8]: constant
    def deposit(pubkey: bytes[48], withdrawal_credentials: bytes[32], signature: bytes[96], deposit_data_root: bytes32): modifying

MAX_SUBS_ATONE: constant(uint256) = 32
MAX_SUBS: constant(uint256) = 256
FEE_VALUE: constant(wei_value) = 100000000000000000 # 0.1 ETH in Wei
FEE_VALUE_BYMONTH: constant(wei_value) = 8400000000000000 # 0.0084 ETH in Wei
STAKE_VALUE: constant(wei_value) = 3200000000000000000 # 3.2 ETH in Wei
ZERO_PUBKEY: constant(bytes[48]) = b""
MONTHS_INSEC: constant(timedelta) = 25920000
SaleReceipt: event({user: indexed(address), subId: indexed(uint256), pubkey: bytes[48]})
RenewReceipt: event({user: indexed(address), subId: indexed(uint256), pubkey: bytes[48]})
AllocationReceipt: event({user: indexed(address), subId: indexed(uint256), userPubkey: bytes[48], nodeKey: bytes[48]})
CancellationReceipt: event({user: indexed(address), subId: indexed(uint256), pubkey: bytes[48]})
deposit_contract: public(address)
lockUpPool: uint256(wei)
feePool:  uint256(wei)
owner: public(address)
activatedDate: public(timestamp)

# Total number subcription of subcribers
userSubscriptionsNum: map(uint256, uint256)
# Mapping from subscriber id to an array subscription ids
subIdsOfUser: map(uint256, uint256[256]) 
# Mapping from subscription id to user address
subscriptionToUserAddress: map(uint256, address) 

# Total units sold by firm, total units cancelled by user, total subscriber
totalSubscriptions: public(uint256) 
totalSubsCancelled: public(uint256)
totalSubcribers: public(uint256)
# Mapping from user address to subscriber id, pubkey 
subscriberIdToUser: map(address, uint256) 
userToWithdrawalKey: map(address, bytes[48]) 

# Subscriptions time in months, validator pubkey
subsTime: public(map(uint256, map(uint256, uint256)))
subsStartTime: public(map(uint256, timestamp))
subsIdToPubKey: map(uint256, bytes[48])
isAllocated: map(uint256, bool)
# Mapping from validator pubkey to subscriptions ID
validatorKeyToSubscription: map(bytes[48], uint256)

#Constructor
@public
def __init__(_deposit_contract: address):
    self.owner = msg.sender
    self.deposit_contract = _deposit_contract

# Activate contract
@public
def activateContract():
    assert msg.sender == self.owner
    self.activatedDate = block.timestamp

# Sale module
@public
@payable
def buyNewSubs(_numOfSub: uint256, _pubkey: bytes[48]):
    # 1.1 - Enforce Max Subscription is 32 at one time
    assert _numOfSub <= MAX_SUBS_ATONE 
    # 1.2 - Assert Correct Amount
    assert msg.value == (_numOfSub * (STAKE_VALUE + FEE_VALUE)) 
    subscriberID:uint256 = self.subscriberIdToUser[msg.sender]
    if subscriberID == 0: # user address does not have subcriber id
        self.userToWithdrawalKey[msg.sender] = _pubkey
        self.totalSubcribers += 1 # subcriber id start from 1
         # 2.2 - Assign New Subscriber
        self.subscriberIdToUser[msg.sender] = self.totalSubcribers
        subscriberID = self.totalSubcribers
    else: 
        assert (self.userSubscriptionsNum[subscriberID] + _numOfSub) <= MAX_SUBS
    idx: uint256 = self.userSubscriptionsNum[subscriberID] + _numOfSub 
    lockUpPool_atm: uint256(wei) = self.lockUpPool
    feePool_atm: uint256(wei) = self.feePool 
    for _ in range(MAX_SUBS):
        if self.userSubscriptionsNum[subscriberID] == idx:
            break
        self.totalSubscriptions += 1
         # Mapping from subID to localSubsID to globalSubId
        self.subIdsOfUser[subscriberID][self.userSubscriptionsNum[subscriberID]] = self.totalSubscriptions
        # 2.1 - Assign Correct Subscription
        self.userSubscriptionsNum[subscriberID] += 1 
        self.subsTime[subscriberID][self.totalSubscriptions] = 12
        self.subsStartTime[self.totalSubscriptions] = block.timestamp
        self.subscriptionToUserAddress[self.totalSubscriptions] = msg.sender
        log.SaleReceipt(msg.sender, self.totalSubscriptions, _pubkey)
    # 1.3 - Fund Amount into LockUpPool & FeePool
    self.lockUpPool += _numOfSub * STAKE_VALUE 
    self.feePool += _numOfSub * FEE_VALUE
    #2.5 - Assert correct term balance after adding terms to new subscription 
    assert self.lockUpPool == lockUpPool_atm + _numOfSub * STAKE_VALUE 
    assert self.feePool == feePool_atm + _numOfSub * FEE_VALUE
     # 1.4 - Assert Correct New Balance of LockUpPool and FeePool
    assert self.balance == (self.lockUpPool + self.feePool) 

# Renew module
@public
@payable
def renewSubs(_subId: uint256[32]): 
    # Assert valid subcriber
    assert self.subscriberIdToUser[msg.sender] > 0 
    subscriberID:uint256 = self.subscriberIdToUser[msg.sender]
    feePool_atm: uint256(wei) = self.feePool
    numOfRenewSubs: uint256 = 0
    for i in range(MAX_SUBS_ATONE):
        if _subId[i] > 0: 
            assert _subId[i] <= self.totalSubscriptions
            # Assert correct subcriber owned subscription id  _subId[i]
            assert self.subsTime[subscriberID][_subId[i]] > 0 
            # Renew subscription for a year
            self.subsTime[subscriberID][_subId[i]] += 12 
            numOfRenewSubs += 1
            log.RenewReceipt(msg.sender, _subId[i], self.userToWithdrawalKey[msg.sender])
    assert msg.value == (numOfRenewSubs * FEE_VALUE)
    self.feePool += msg.value
    # 2.6 - Asset correct term balance after adding terms to existing subscription
    assert self.feePool == feePool_atm + numOfRenewSubs * FEE_VALUE 

# Allocations module
@public
def allocationSubs(_depositData: bytes[3328], _subId: uint256[16]):
    assert msg.sender == self.owner
    numOfAllocate: uint256 = 0
    lockUpPool_atm: uint256(wei) = self.lockUpPool
    for i in range (16):
        if _subId[i] > 0:
            # 1.1 - Assert Valid Subscription
            # 1.2 -  Assert that the subscription to be allocated has not been allocated before
            assert _subId[i] <= self.totalSubscriptions and self.isAllocated[_subId[i]] == False
            user_addr: address = self.subscriptionToUserAddress[_subId[i]] # Address of end user own subs _subId[i]
            index: int128 = i * 208
            # Deposit Agreements
            pubkey: bytes[48] = slice(_depositData, start=index, len=48) 
            # 1.2 Assert that the allocated validator public key has not already been allocated to another subscription.
            assert pubkey != ZERO_PUBKEY and self.validatorKeyToSubscription[pubkey] == 0 
            withdrawal_credentials: bytes[32] = slice(_depositData, start=index+48, len=32)
            signature: bytes[96] = slice(_depositData, start=index+80, len=96)
            deposit_data_root: bytes32 = extract32(_depositData, index+176)
            
            # 1.3 - Make internal contract call to Deposit contract
            Validator_Registration(self.deposit_contract).deposit( 
                pubkey,
                withdrawal_credentials,
                signature,
                deposit_data_root,
                value=STAKE_VALUE
            )
            numOfAllocate += 1
            self.isAllocated[_subId[i]] = True
            self.lockUpPool -= STAKE_VALUE
            self.subsIdToPubKey[_subId[i]] = pubkey 
            self.validatorKeyToSubscription[pubkey] = _subId[i]
            log.AllocationReceipt(user_addr, _subId[i], self.userToWithdrawalKey[user_addr], pubkey)
    # 1.4 - Assert Correct Balances
    assert self.lockUpPool == lockUpPool_atm - numOfAllocate * STAKE_VALUE

# Caculate fee
@private
def getWithdrawPoolBalance() -> uint256(wei):
    subsAvailable: uint256 = self.totalSubscriptions - self.totalSubsCancelled
    withDrawPoolBalance: uint256(wei) = subsAvailable * FEE_VALUE_BYMONTH
    return withDrawPoolBalance

# Owner call this function to withdrawal fee each month passed
@public
def collectWithdrawFee():
    assert msg.sender == self.owner
    feePool_atm: uint256(wei) = self.feePool
    withDrawBalance: uint256(wei) = self.getWithdrawPoolBalance()
    send(msg.sender, withDrawBalance)
    self.feePool -= withDrawBalance
    assert self.feePool == feePool_atm - withDrawBalance

# Calculate refund value of subscription
@private
def getRefundBalance(_subsId: uint256, _subsTime: uint256) -> uint256(wei):
    totalLeaseMonth :uint256 = (block.timestamp - self.subsStartTime[_subsId]) / MONTHS_INSEC + 1 
    refundValueOfSubsId: uint256(wei) = (_subsTime / 12) * FEE_VALUE - totalLeaseMonth * FEE_VALUE_BYMONTH
    return refundValueOfSubsId

#Subscriber call this function to cancel their own subs and get rebate
@public
def cancellationSubs(_subId: uint256[32]):
    # Assert vsalid subcriber, first time to cancel subscriptions is 1 month after activated date
    # assert block.timestamp >= (self.activatedDate + MONTHS_INSEC) #remove this line for testing
    assert self.subscriberIdToUser[msg.sender] > 0 
    subscriberID: uint256 = self.subscriberIdToUser[msg.sender]
    totalRefundBalance: uint256(wei) = 0
    feePool_atm: uint256(wei) = self.feePool
    for i in range(MAX_SUBS_ATONE):
        if _subId[i] > 0:
            assert _subId[i] <= self.totalSubscriptions
            # Assert correct subcriber owned subscription id  _subId[i]
            assert self.subsTime[subscriberID][_subId[i]] > 0 
            refundValueOfSubs:uint256(wei) = self.getRefundBalance(_subId[i], self.subsTime[subscriberID][_subId[i]])
            totalRefundBalance += refundValueOfSubs
            self.feePool -= refundValueOfSubs
            self.totalSubsCancelled += 1
            self.userSubscriptionsNum[subscriberID] -= 1
            log.CancellationReceipt(msg.sender, _subId[i], self.userToWithdrawalKey[msg.sender])
            # Delete subscription informations
            clear(self.subsTime[subscriberID][_subId[i]])
            clear(self.subsStartTime[_subId[i]])
            clear(self.subscriptionToUserAddress[_subId[i]])
            pubkeyToSubs: bytes[48] = self.subsIdToPubKey[_subId[i]]
            clear(self.validatorKeyToSubscription[pubkeyToSubs])
            clear(self.subsIdToPubKey[_subId[i]])
    send(msg.sender, totalRefundBalance)
    assert self.feePool == feePool_atm - totalRefundBalance

# 2.7 - Get subscriptions by subscriber
@public
@constant
def getSubs(_subscriber: address) -> uint256[256]: 
    return self.subIdsOfUser[self.subscriberIdToUser[_subscriber]]

# 2.8 - Get number of subscriptions by subscriber
@public
@constant
def getNumOfSubs(_subscriber: address) -> uint256: 
    return self.userSubscriptionsNum[self.subscriberIdToUser[_subscriber]]

# 1.5 - Getter Function to get LockUp Pool Amount in ETH
@public
@constant
def getFeePool() -> uint256(wei):  
    return self.feePool

 # 1.6 - Getter Function to get FeePool Amount in ETH
@public
@constant
def getLockUpPool() -> uint256(wei):
    return self.lockUpPool

 # 2.10 - Get total number of subscriptions sold
@public
@constant
def getTotalSubscriptions() -> uint256:
    return self.totalSubscriptions

# Get total number of subscriber
@public
@constant
def getTotalSubcriber() -> uint256: 
    return self.totalSubcribers
