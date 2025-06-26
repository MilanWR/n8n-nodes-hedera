import {
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	IDataObject,
    NodeConnectionType,
    NodeApiError,
    NodeOperationError,
    JsonObject,
} from 'n8n-workflow';

import {
	Client,
	PrivateKey,
	AccountCreateTransaction,
	TransferTransaction,
	Hbar,
	Transaction,
} from '@hashgraph/sdk';

/** Shape of the decrypted credential object we expect from n8n */
interface IHederaCredentials {
	accountId: string;
	privateKey: string;
	network: 'mainnet' | 'testnet' | 'previewnet';
}

export class Hedera implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Hedera',
		name: 'hedera',
		icon: 'file:hedera.svg',
		group: ['transform'],
		version: 1,
		description: 'Interact with the Hedera Hashgraph network',
		defaults: { name: 'Hedera' },
		inputs: [NodeConnectionType.Main],
		outputs: [NodeConnectionType.Main],
		credentials: [
			{
				name: 'hederaApi',
				required: true,
			},
		],
		properties: [
			/* -------------------------------------------------------------------------- */
			/*                                base choice                                 */
			/* -------------------------------------------------------------------------- */
			{
				displayName: 'Resource',
				name: 'resource',
                noDataExpression: true,
				type: 'options',
				options: [
					{ name: 'Account', value: 'account' },
					{ name: 'Transaction', value: 'transaction' },
				],
				default: 'account',
				description: 'Resource type to operate on',
			},

			/* -------------------------------------------------------------------------- */
			/*                              account ops                                   */
			/* -------------------------------------------------------------------------- */
			{
				displayName: 'Operation',
				name: 'accountOperation', // unique name!
				type: 'options',
				displayOptions: {
					show: { resource: ['account'] },
				},
				options: [
					{ name: 'Create Account', value: 'create', description: 'Create a new Hedera account' },
					{ name: 'Transfer HBAR', value: 'transfer', description: 'Transfer HBAR to another account' },
				],
				default: 'create',
			},
			{
				displayName: 'Recipient Account ID',
				name: 'recipientId',
				type: 'string',
				displayOptions: {
					show: {
						resource: ['account'],
						accountOperation: ['transfer'],
					},
				},
				default: '',
				description: 'Hedera Account ID to send HBAR to',
				required: true,
			},
			{
				displayName: 'Amount (HBAR)',
				name: 'amount',
				type: 'number',
				displayOptions: {
					show: {
						resource: ['account'],
						accountOperation: ['transfer'],
					},
				},
				typeOptions: {
					minValue: 0,
					numberPrecision: 8,
				},
				default: 0,
				description: 'Amount of HBAR to transfer',
				required: true,
			},
			{
				displayName: 'Initial Balance (HBAR)',
				name: 'initialBalance',
				type: 'number',
				displayOptions: {
					show: {
						resource: ['account'],
						accountOperation: ['create'],
					},
				},
				default: 0,
				description: 'Initial HBAR funding for the new account',
			},

			/* -------------------------------------------------------------------------- */
			/*                           transaction ops                                  */
			/* -------------------------------------------------------------------------- */
			{
				displayName: 'Operation',
				name: 'transactionOperation', // unique name!
				type: 'options',
				displayOptions: {
					show: { resource: ['transaction'] },
				},
				options: [
					{ name: 'Sign Transaction', value: 'sign', description: 'Sign a transaction payload' },
					{ name: 'Submit Transaction', value: 'submit', description: 'Submit a signed transaction to the network' },
					{ name: 'Sign and Submit Transaction', value: 'signAndSubmit', description: 'Sign and submit a transaction in one step' },
				],
				default: 'sign',
			},
			{
				displayName: 'Transaction Format',
				name: 'transactionFormat',
				type: 'options',
				displayOptions: {
					show: {
						resource: ['transaction'],
						transactionOperation: ['sign', 'submit', 'signAndSubmit'],
					},
				},
				options: [
					{ name: 'Base64 String', value: 'base64', description: 'Transaction as base64 encoded string' },
					{ name: 'Buffer Object', value: 'buffer', description: 'Transaction as Buffer object with data array' },
				],
				default: 'base64',
				description: 'Format of the transaction data',
			},
			{
				displayName: 'Transaction (Base64)',
				name: 'transaction',
				type: 'string',
				displayOptions: {
					show: {
						resource: ['transaction'],
						transactionOperation: ['sign', 'submit', 'signAndSubmit'],
						transactionFormat: ['base64'],
					},
				},
				default: '',
				description: 'The transaction in base64-encoded form',
				required: true,
			},
			{
				displayName: 'Transaction Buffer',
				name: 'transactionBuffer',
				type: 'json',
				displayOptions: {
					show: {
						resource: ['transaction'],
						transactionOperation: ['sign', 'submit', 'signAndSubmit'],
						transactionFormat: ['buffer'],
					},
				},
				default: '',
				description: 'The transaction as Buffer object (e.g., from transBytes or transBase64 field)',
				required: true,
			},
		],
	};

	/* -------------------------------------------------------------------------- */
	/*                                   logic                                    */
	/* -------------------------------------------------------------------------- */
	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];

		// ---- credentials -------------------------------------------------------
		const creds = (await this.getCredentials('hederaApi')) as IHederaCredentials;
		if (!creds?.accountId || !creds.privateKey) {
			throw new NodeOperationError(this.getNode(), 'Hedera credentials are not set up correctly.');
		}

		const { accountId, privateKey: privKeyStr, network } = creds;

		// Initialize Hedera client
		const client =
			network === 'mainnet'
				? Client.forMainnet()
				: network === 'testnet'
					? Client.forTestnet()
					: Client.forPreviewnet();

		client.setOperator(accountId, privKeyStr);

		// ---- loop over items ---------------------------------------------------
		for (let i = 0; i < items.length; i++) {
			try {
				const resource = this.getNodeParameter('resource', i) as string;
				let result: IDataObject = {};

				/* ===========================  account  =========================== */
				if (resource === 'account') {
					const operation = this.getNodeParameter('accountOperation', i) as string;

					/* -------- create -------- */
					if (operation === 'create') {
						const initialBalance = this.getNodeParameter('initialBalance', i) as number;

						const newPrivateKey = PrivateKey.generateED25519();
						const newPublicKey = newPrivateKey.publicKey;

						const txId = await new AccountCreateTransaction()
							.setKey(newPublicKey)
							.setInitialBalance(new Hbar(initialBalance))
							.execute(client);

						const receipt = await txId.getReceipt(client);
						if (!receipt.accountId) {
							throw new NodeOperationError(this.getNode(), `Account creation failed: ${receipt.status.toString()}`);
						}

						result = {
							newAccountId: receipt.accountId.toString(),
							newAccountPublicKey: newPublicKey.toString(),
							newAccountPrivateKey: newPrivateKey.toString(), // consider gating this
						};
					}

					/* -------- transfer -------- */
					else if (operation === 'transfer') {
						const recipientId = this.getNodeParameter('recipientId', i) as string;
						const amount = this.getNodeParameter('amount', i) as number;
						const hbarAmount = new Hbar(amount);

						const txResponse = await new TransferTransaction()
							.addHbarTransfer(accountId, hbarAmount.negated()) // sender
							.addHbarTransfer(recipientId, hbarAmount)         // recipient
							.execute(client);

						const receipt = await txResponse.getReceipt(client);

						result = {
							status: receipt.status.toString(),
							transactionId: txResponse.transactionId.toString() || '',
						};
					}

					else {
						throw new NodeOperationError(this.getNode(), `Unsupported account operation: ${operation}`);
					}
				}

				/* ========================  transaction  ========================= */
				else if (resource === 'transaction') {
					const operation = this.getNodeParameter('transactionOperation', i) as string;
					const transactionFormat = this.getNodeParameter('transactionFormat', i) as string;
					
					// Helper function to get transaction bytes from either format
					const getTransactionBytes = (): Buffer => {
						if (transactionFormat === 'base64') {
							const txBase64 = this.getNodeParameter('transaction', i) as string;
							return Buffer.from(txBase64, 'base64');
						} else {
							const bufferObj = this.getNodeParameter('transactionBuffer', i) as any;
							
							// Handle different possible buffer object structures
							let data: number[];
							if (bufferObj?.data) {
								data = bufferObj.data;
							} else if (bufferObj?.transBytes?.data) {
								data = bufferObj.transBytes.data;
							} else if (bufferObj?.transBase64?.data) {
								data = bufferObj.transBase64.data;
							} else if (Array.isArray(bufferObj)) {
								data = bufferObj;
							} else {
								throw new NodeOperationError(this.getNode(), 'Invalid buffer object format. Expected object with data array or direct array.');
							}
							
							return Buffer.from(data);
						}
					};

					if (operation === 'sign') {
						const txBuffer = getTransactionBytes();
						const transaction = Transaction.fromBytes(txBuffer);

						const signedTx = await transaction.sign(PrivateKey.fromString(privKeyStr));

						result = {
							signedTransaction: Buffer.from(signedTx.toBytes()).toString('base64'),
						};
					} else if (operation === 'submit') {
						const txBuffer = getTransactionBytes();
						const transaction = Transaction.fromBytes(txBuffer);

						// Submit the transaction to the network
						const txResponse = await transaction.execute(client);
						
						// Get the receipt to confirm execution
						const receipt = await txResponse.getReceipt(client);

						result = {
							transactionId: txResponse.transactionId.toString(),
							nodeId: txResponse.nodeId?.toString() || '',
							transactionHash: Buffer.from(txResponse.transactionHash).toString('hex'),
							status: receipt.status.toString(),
						};
					} else if (operation === 'signAndSubmit') {
						const txBuffer = getTransactionBytes();
						const transaction = Transaction.fromBytes(txBuffer);

						// Sign the transaction first
						const signedTx = await transaction.sign(PrivateKey.fromString(privKeyStr));
						
						// Then submit to the network
						const txResponse = await signedTx.execute(client);
						
						// Get the receipt to confirm execution
						const receipt = await txResponse.getReceipt(client);

						result = {
							transactionId: txResponse.transactionId.toString(),
							nodeId: txResponse.nodeId?.toString() || '',
							transactionHash: Buffer.from(txResponse.transactionHash).toString('hex'),
							status: receipt.status.toString(),
							signedTransaction: Buffer.from(signedTx.toBytes()).toString('base64'),
						};
					} else {
						throw new NodeOperationError(this.getNode(), `Unsupported transaction operation: ${operation}`);
					}
				}

				else {
					throw new NodeOperationError(this.getNode(), `Unsupported resource: ${resource}`);
				}

				returnData.push({ json: result });
			} catch (err) {
				if (this.continueOnFail()) {
					returnData.push({ json: { error: (err as Error).message } });
					continue;
				}
				throw new NodeApiError(this.getNode(), err as JsonObject);
			}
		}

		return this.prepareOutputData(returnData);
	}
}
