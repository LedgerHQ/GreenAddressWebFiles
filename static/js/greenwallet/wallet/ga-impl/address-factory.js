var extend = require('xtend/mutable');
var bitcoin = require('bitcoinjs-lib');

module.exports = GAAddressFactory;

extend(GAAddressFactory.prototype, {
  getNextAddress: getNextAddress,
  getNextOutputScript: getNextOutputScript,
  getNextOutputScriptWithPointer: getNextOutputScriptWithPointer,
  getScanningKeyForScript: getScanningKeyForScript
});

function GAAddressFactory (gaService, signingWallet, options) {
  this.gaService = gaService;
  this.signingWallet = signingWallet;
  this.scriptToPointer = {};
  this.subaccountPointer = options.subaccountPointer || null;
}

function getNextOutputScriptWithPointer () {
  return this.gaService.call(
    'com.greenaddress.vault.fund',
    // TODO: verification against our keys
    [this.subaccountPointer, /* return_pointer = */true]
  ).then(function (script) {
    var ret = bitcoin.script.scriptHashOutput(
      bitcoin.crypto.hash160(new Buffer(script.script, 'hex'))
    );
    this.scriptToPointer[ret.toString('hex')] = script.pointer;
    return {
      outScript: ret,
      pointer: script.pointer,
      subaccountPointer: this.subaccountPointer
    };
  }.bind(this));
}

function getNextOutputScript () {
  return this.getNextOutputWithPointer().then(function (res) {
    return res.outScript;
  });
}

function getNextAddress () {
  return this.getNextOutputScript(function (script) {
    return bitcoin.address.fromOutputScript(
      script, bitcoin.networks[this.gaService.netName]
    );
  }.bind(this));
}

function getScanningKeyForScript (script) {
  var pointer = this.scriptToPointer[script.toString('hex')];
  if (pointer === undefined) {
    throw new Error('Missing pointer');
  }
  var rootHdWallet = this.signingWallet.keysManager.privHDWallet; // FIXME: hw wallets
  var hd;
  if (this.subaccountPointer && this.subaccountHdWallet) {
    hd = Promise.resolve(this.subaccountHdWallet);
  } else if (this.subaccountPointer) {
    hd = rootHdWallet.deriveHardened(
      3
    ).then(function (hd) {
      return hd.deriveHardened(this.subaccountPointer);
    }.bind(this)).then(function (hd) {
      // derive subaccount only once and cache it to avoid deriving the same
      // key multiple times
      this.subaccountHdWallet = hd;
      return hd;
    }.bind(this));
  } else {
    hd = Promise.resolve(rootHdWallet);
  }
  return hd.then(function (hd) {
    return hd.deriveHardened(5);
  }).then(function (hd) {
    return hd.deriveHardened(pointer);
  });
}
