import {
	ICredentialType,
	INodeProperties,
} from 'n8n-workflow';

export class HederaApi implements ICredentialType {
	name = 'hederaApi';
	displayName = 'Hedera Account';
	documentationUrl = 'https://docs.hedera.com/hedera/core-concepts/accounts';
	properties: INodeProperties[] = [
		{
			displayName: 'Account ID',
			name: 'accountId',
			type: 'string',
			default: '',
			required: true,
			description: 'Your Hedera Account ID (e.g. 0.0.x)',
			placeholder: '0.0.123456',
		},
		{
			displayName: 'Private Key',
			name: 'privateKey',
			type: 'string',
			typeOptions: {
				password: true,
			},
			default: '',
			required: true,
			description: 'Your Hedera account private key (ED25519 or SECP256K1)',
		},
		{
			displayName: 'Network',
			name: 'network',
			type: 'options',
			options: [
				{
					name: 'Mainnet',
					value: 'mainnet',
				},
				{
					name: 'Testnet',
					value: 'testnet',
				},
				{
					name: 'Previewnet',
					value: 'previewnet',
				},
			],
			default: 'testnet',
			required: true,
			description: 'Hedera network to connect to',
		},
	];
} 