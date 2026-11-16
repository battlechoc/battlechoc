// Yaci Store event handlers (application-plugins.yml), run by its JavaScript plugin runtime
// (GraalJS) with the variables Yaci Store provides: named_jdbc (Spring's NamedParameterJdbcTemplate
// on Yaci Store's own connection, schema yaci_store), global_state and console.
//
// Yaci Store writes a tx_input row for every input of every transaction, but keeps only the
// outputs with a user token of the game's policy (the filter on utxo.unspent.save). A spend of an output
// it never kept is useless: this deletes those rows after each batch of blocks. Yaci Store saves
// a batch's outputs and spends before it sends CommitEvent, so an output spent in the same batch
// is already there and its spend stays. The views of the API look only at spends of kept outputs,
// so a leftover row costs space, never a wrong answer.
//
// Mark: the slot of the last batch cleaned up (kept in memory: after a restart the first clean-up
// covers the whole table once).

function handleCommitEvent(event) {
    var lastSlot = global_state.get('battlechoc_tx_input_slot');
    if (lastSlot === null || lastSlot === undefined) {
        lastSlot = -1;
    }
    var deleted = named_jdbc.update(
        'DELETE FROM tx_input ti ' +
            'WHERE ti.spent_at_slot > :last_slot ' +
            'AND NOT EXISTS (SELECT 1 FROM address_utxo au WHERE au.tx_hash = ti.tx_hash AND au.output_index = ti.output_index)',
        { last_slot: lastSlot }
    );
    if (deleted > 0) {
        console.log('battlechoc: deleted ' + deleted + ' spends of outputs not kept, above slot ' + lastSlot);
    }
    global_state.put('battlechoc_tx_input_slot', event.getMetadata().getSlot());
}

// After a rollback the blocks above its point come again: the next clean-up starts there.
function handleRollbackEvent(event) {
    global_state.put('battlechoc_tx_input_slot', event.getRollbackTo().getSlot());
}
