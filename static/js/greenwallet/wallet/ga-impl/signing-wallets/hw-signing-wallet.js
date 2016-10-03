var extend = require('xtend/mutable');
var sha512 = require('sha512');
var HWKeysManager = require('./../keys-managers/hw-keys-manager');
var ScriptFactory = require('./../script-factory');

module.exports = HwSigningWallet;

extend(HwSigningWallet.prototype, {
  getChallengeArguments: getChallengeArguments,
  signChallenge: signChallenge,
  signTransaction: signTransaction,
  derivePath: derivePath,
  getChainCode: getChainCode
});

function HwSigningWallet (options) {
  this.keysManager = new HWKeysManager({
    gaService: options.gaService,
    pubHDWallet: options.hd,
    hw: options.hw
  });
  this.hw = options.hw;
  this.scriptFactory = new ScriptFactory(this.keysManager);
  this.loginProgressCb = options.loginProgressCb;
}

function getChallengeArguments () {
  return this.hw.getChallengeArguments();
}

function signChallenge (challenge) {
  // btchip requires 0xB11E to skip HID authentication
  // 0x4741 = 18241 = 256*G + A in ASCII
  var path = '' + 0x4741b11e;

  challenge = 'greenaddress.it      login ' + challenge;
  return this.hw.signMessage(
    path, challenge,
    {progressCb: this.loginProgressCb}
  ).then(function (signature) {
    signature = [ signature.r.toString(), signature.s.toString(), signature.i.toString() ];
    return {signature: signature, path: 'GA'};
  });
}

function signTransaction (tx, options) {
  return this.hw.signTransaction(tx, extend({
    keysManager: this.keysManager,
    scriptFactory: this.scriptFactory
  }, options));
}

function derivePath () {
  return this.hw.getPublicKey("18241'").then(function (pubkey) {
    var extended = (
      pubkey.hdnode.chainCode.toString('hex') +
      pubkey.hdnode.keyPair.getPublicKeyBuffer().toString('hex')
    );
    return sha512.hmac('GreenAddress.it HD wallet path').finalize(extended);
  });
}

function getChainCode () {
  return Promise.resolve(this.keysManager.pubHDWallet.getChainCode());
}
