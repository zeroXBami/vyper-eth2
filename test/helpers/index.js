const bls = require('@chainsafe/bls');
const ssz = require('@chainsafe/ssz');
const {types} = require('@chainsafe/eth2.0-types/lib/ssz/presets/mainnet')
const hash = ssz.hash;
const hashTreeRoot = ssz.hashTreeRoot;
const signingRoot = ssz.signingRoot;
const DepositData = types.DepositData;
bls.initBLS();
const PrivateKey = bls.PrivateKey;
const PubKey = bls.PublicKey;
const BLS_WITHDRAWAL_PREFIX_BYTE = Buffer.alloc(1, 0);

const createPrivKETH2 = () => {
    return PrivateKey.random();
}

const createPubKeyETH2 = (priK) => {
    return priK.toPublicKey().toBytesCompressed();
}

const createUserWithdrawal = (pubKey) => {
    return Buffer.concat([BLS_WITHDRAWAL_PREFIX_BYTE, hash(pubKey).slice(1)]);
}


const createDepositData = (validatorPubkey, userWithdrawlCred, amountStaked) => {
    const depositData = {
        validatorPubkey,
        userWithdrawlCred,
        amountStaked,
        signature: Buffer.alloc(96)
    };
    return depositData
}

const sigDepositAgreements = (privateKey, pubkey, withdrawalCredentials, amount) => {
    return bls.sign(
        privateKey.toBytes(),
        signingRoot({
            pubkey,
            withdrawalCredentials,
            amount,
            signature: Buffer.alloc(96)
        }, types.DepositData),
        Buffer.from([0, 0, 0, 3])
    )  
}

const createDepositDataRoot = (pubkey, withdrawalCredentials, amount, signature) => {
    return hashTreeRoot({
        pubkey,
        withdrawalCredentials,
        amount,
        signature
    }, types.DepositData);
}
export {
    createPrivKETH2,
    createPubKeyETH2,
    createUserWithdrawal,
    createDepositData,
    sigDepositAgreements,
    createDepositDataRoot
}