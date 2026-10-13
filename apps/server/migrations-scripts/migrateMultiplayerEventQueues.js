
app.get('/maintenance/transformqueues', async (req, res) => {
    try {
        let allQueues = await db.collection('multiplayerEventQueues').get();
        let str = "";
        await Promise.all(allQueues.docs.map(async doc => {
            const queueData = doc.data();
            if (typeof queueData.lastProcessedEvent !== 'undefined' && typeof queueData.players !== 'undefined') {
                let newQueueData = {
                    lastProcessedEvent: queueData.lastProcessedEvent,
                    playerIds: [queueData.players[0].id, queueData.players[1].id],
                    player_0_events: queueData.players[0].events,
                    player_1_events: queueData.players[1].events
                }
                await db.collection('multiplayerEventQueues').doc(doc.id).set(newQueueData);
            } else {
                str = str + " - " + doc.id;
            }
        }));
        res.status(200).json({ txt: str });
    } catch (err) {
        console.error("Could not update event queue object", err);
        res.status(500).json({ error: err.toString() });
    }
});
