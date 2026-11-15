// Koios's JSON for the tests of the Koios adapter (chainKoiosProvider.test.js) and the contract of
// both adapters (chainProviderContract.test.js), shaped as preprod.koios.rest answered on
// 2026-11-15: a UTxO of /address_utxos, /account_utxos, /utxo_info and /asset_utxos with
// `_extended: true`, and a row of /epoch_params.

/**
 * A UTxO as Koios answers it: `tokens` { unit: quantity }, `inlineDatum` its CBOR (Koios also
 * gives its hash, as `dataHash`), `referenceScript` Koios's { hash, size, type, bytes, value }.
 */
const koiosEntry = ({ address, lovelace = '5000000', tokens = {}, txHash = '0'.repeat(63) + '1', index = 0, inlineDatum = null, dataHash = null, referenceScript = null, isSpent = false }) => ({
    tx_hash: txHash,
    tx_index: index,
    address,
    value: String(lovelace),
    stake_address: null,
    payment_cred: null,
    epoch_no: 325,
    block_height: 5415499,
    block_time: 1794749973,
    datum_hash: dataHash,
    inline_datum: inlineDatum === null ? null : { bytes: inlineDatum, value: {} },
    reference_script: referenceScript,
    asset_list: Object.entries(tokens).map(([unit, quantity]) => ({ decimals: 0, quantity: String(quantity), policy_id: unit.slice(0, 56), asset_name: unit.slice(56), fingerprint: 'asset1' })),
    is_spent: isSpent,
});

/** Koios's /epoch_params row for the parameters `params` (Provider.ProtocolParameters). */
const koiosParamsOf = params => ({
    epoch_no: 325,
    era: 'Conway',
    min_fee_a: params.minFeeA,
    min_fee_b: params.minFeeB,
    max_block_size: 90112,
    max_tx_size: params.maxTxSize,
    max_bh_size: 1100,
    key_deposit: String(params.keyDeposit),
    pool_deposit: String(params.poolDeposit),
    max_epoch: 18,
    optimal_pool_count: 500,
    influence: 0.3,
    monetary_expand_rate: 0.003,
    treasury_growth_rate: 0.2,
    decentralisation: 0,
    extra_entropy: null,
    protocol_major: 11,
    protocol_minor: 0,
    min_utxo_value: '0',
    min_pool_cost: '75000000',
    nonce: 'ab'.repeat(32),
    block_hash: 'cd'.repeat(32),
    cost_models: Object.fromEntries(Object.entries(params.costModels).map(([language, costs]) => [language, Object.values(costs)])),
    price_mem: params.priceMem,
    price_step: params.priceStep,
    max_tx_ex_mem: Number(params.maxTxExMem),
    max_tx_ex_steps: Number(params.maxTxExSteps),
    max_block_ex_mem: 77500000,
    max_block_ex_steps: 20000000000,
    max_val_size: params.maxValSize,
    collateral_percent: params.collateralPercentage,
    max_collateral_inputs: params.maxCollateralInputs,
    coins_per_utxo_size: String(params.coinsPerUtxoByte),
    gov_action_deposit: String(params.govActionDeposit),
    drep_deposit: String(params.drepDeposit),
    min_fee_ref_script_cost_per_byte: params.minFeeRefScriptCostPerByte,
});

module.exports = { koiosEntry, koiosParamsOf };
