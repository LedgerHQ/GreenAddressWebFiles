var BigInteger = require('bigi');
var extend = require('xtend/mutable');

module.exports = GAKeysManager;

extend(GAKeysManager.prototype, {
  _getKey: _getKey,
  getGAPubKey: getGAPubKey,
  getMyPubKey: getMyPubKey,
  getSigningKey: getSigningKey
});

function GAKeysManager (options) {
  this.gaHDNode = options.gaService.gaHDNode;
  this.gaPath = options.gaService.gaPath;

  // optimisation for non-subaccounts subkeys and slow hardware wallets
  // (we don't need the priv-derivation to derive non-subaccount subkeys)
  this.pubHDWallet = options.pubHDWallet;
  this.privHDWallet = options.privHDWallet;
}


function _subpath (hd, pathBuffer) {
  var copy = new Buffer(pathBuffer);
  for (var i = 0; i < 32; i++) {
    hd = hd.derive(+BigInteger.fromBuffer(copy.slice(0, 2)));
    copy = copy.slice(2);
  }
  return hd;
}

function getGAPubKey (subaccountPointer, pointer) {
  var gaNode = this.gaHDNode;
  if (subaccountPointer) {
    gaNode = _subpath(gaNode.derive(3), this.gaPath).derive(subaccountPointer);
  } else {
    gaNode = _subpath(gaNode.derive(1), this.gaPath);
  }
  return gaNode.derive(pointer);
}

function _getSubaccountHDKey (hdwallet, subaccountPointer) {
  return hdwallet.deriveHardened(3).then(function (hd) {
    return hd.deriveHardened(subaccountPointer);
  });
}

function _getKey (signing, subaccountPointer, pointer) {
  var key;
  // TODO: subaccount key caching (to avoid deriving via hw wallet multiple times)
  if (subaccountPointer) {
    key = _getSubaccountHDKey(this.privHDWallet, subaccountPointer);
    if (!signing) {
      key = key.then(function(hd) { 
        return hd.neutered();
      });
    }
  } else {
    key = Promise.resolve(signing ? this.privHDWallet : this.pubHDWallet);
  }
  return key.then(function (hd) {
    return hd.derive(1);
  }).then(function (hd) {
    return hd.derive(pointer);
  }.bind(this));
}

function getMyPubKey (subaccountPointer, pointer) {
  // priv only for subaccounts -- avoid involving hw wallets when not necessary
  return this._getKey(false, subaccountPointer, pointer);
}

function getSigningKey (subaccountPointer, pointer) {
  // always priv, even when it's not a subaccount
  return this._getKey(true, subaccountPointer, pointer);
}