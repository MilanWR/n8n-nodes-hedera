'use strict';

const { HederaApi } = require('./dist/credentials/HederaApi.credentials');
const { Hedera } = require('./dist/nodes/Hedera/Hedera.node');

module.exports = {
	credentials: {
		HederaApi,
	},
	nodes: {
		Hedera,
	},
};
