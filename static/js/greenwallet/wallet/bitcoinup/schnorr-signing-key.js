var bitcoin = require('bitcoinjs-lib');
var bip39 = require('bip39');
var extend = require('xtend/mutable');
var pbkdf2 = require('pbkdf2').pbkdf2Sync;
var secp256k1 = require('secp256k1-alpha');
var secp256k1ctx = null;
var sha512 = require('sha512');

module.exports = SchnorrSigningKey;

extend(SchnorrSigningKey.prototype, {
  signHash: signHash,
  getAddress: getAddress,
  getPublicKeyBuffer: getPublicKeyBuffer,
  derive: derive,
  deriveHardened: deriveHardened,
  _derivePathSeed: _derivePathSeed,
  derivePath: derivePath,
  neutered: neutered
});
SchnorrSigningKey.secp256k1 = secp256k1;
SchnorrSigningKey.getSecp256k1Ctx = checkContext;
SchnorrSigningKey.fromMnemonic = fromMnemonic;

function SchnorrSigningKey (hdnode, mnemonic) {
  this.hdnode = hdnode;
  this.mnemonic = mnemonic;
}

function signHash (msgIn) {
  checkContext();
  return new Promise(function (resolve, reject) {
    var key = this.hdnode.keyPair;
    var sig = secp256k1._malloc(64);
    var msg = secp256k1._malloc(32);
    var seckey = secp256k1._malloc(32);
    var start = key.d.toByteArray().length - 32;
    var slice;
    if (start >= 0) {  // remove excess zeroes
      slice = key.d.toByteArray().slice(start);
    } else {  // add missing zeroes
      slice = key.d.toByteArray();
      while (slice.length < 32) slice.unshift(0);
    }

    secp256k1.writeArrayToMemory(slice, seckey);
    var i;
    for (i = 0; i < 32; ++i) {
      secp256k1.setValue(msg + i, msgIn[i], 'i8');
    }
    if (secp256k1._secp256k1_schnorr_sign(
      secp256k1ctx, msg, sig, seckey, 0, 0
    ) !== 1) {
      reject('secp256k1 Schnorr sign failed');
    }
    var len = 64;
    var ret = new Buffer(len);
    for (i = 0; i < len; ++i) {
      ret.writeUInt8(secp256k1.getValue(sig + i, 'i8') & 0xff, i);
    }
    secp256k1._free(sig);
    secp256k1._free(msg);
    secp256k1._free(seckey);

    resolve(ret);
  }.bind(this));
}

function getAddress () {
  return this.hdnode.keyPair.getAddress().toString();
}

function getPublicKeyBuffer () {
  return this.hdnode.keyPair.getPublicKeyBuffer();
}

function derive (i) {
  // hdnode can be async (if patched by GA), but doesn't have to (bitcoinjs)
  return Promise.resolve(this.hdnode.derive(i)).then(function (hd) {
    return new SchnorrSigningKey(hd);
  });
}

function neutered () {
  return Promise.resolve(new SchnorrSigningKey(this.hdnode.neutered()));
}

function deriveHardened (i) {
  // hdnode can be async (if patched by GA), but doesn't have to (bitcoinjs)
  return Promise.resolve(this.hdnode.deriveHardened(i)).then(function (hd) {
    return new SchnorrSigningKey(hd);
  });
}

function checkContext () {
  if (secp256k1ctx === null) {
    secp256k1ctx = secp256k1._secp256k1_context_create(3);
    secp256k1._secp256k1_pedersen_context_initialize(secp256k1ctx);
    secp256k1._secp256k1_rangeproof_context_initialize(secp256k1ctx);
  }
  return secp256k1ctx;
}

function fromMnemonic (mnemonic, netName) {
  var curNet = bitcoin.networks[netName || 'testnet'];
  var seed = bip39.mnemonicToSeedHex(mnemonic);  // this is slow, perhaps move to a webworker
  return Promise.resolve(
    new SchnorrSigningKey(bitcoin.HDNode.fromSeedHex(seed, curNet), mnemonic)
  );
}

function _derivePathSeed () {
  var mnemonicBuffer = new Buffer(this.mnemonic, 'utf8');
  var saltBuffer = new Buffer('greenaddress_path', 'utf8');

  return pbkdf2(mnemonicBuffer, saltBuffer, 2048, 64, 'sha512');
}

function derivePath () {
  var seedBuffer = this.derivePathSeed();
  var hasher = sha512.hmac('GreenAddress.it HD wallet path');
  return Promise.resolve(hasher.finalize(seedBuffer));
}
