# battlechoc-server

The battlechoc functions & firestore backend 

## Getting Started

- cd functions && npm install
- yarn serve (local), or yarn deploy (online) 

## Testing

- Install Postman (https://www.getpostman.com/)
- [POST] http://localhost:5000/battlechoc/us-central1/battlechoc/debugging/gamestate

{"gamestate":[{"type":"battlechoc/gameplay/startGame","payload":[{"name":"Charlie Bucket","type":"PlayerType.HUMAN","id":"816741bd-7db0-412e-b53f-6e904275f958","cacao":50,"cacaoPerTurn":0,"buildings":0,"buildingsPerTurn":0,"attacks":0,"attacksPerTurn":0,"fruitAttacks":0,"fruitAttacksPerTurn":0,"hotChocolateAttacks":0,"hotChocolateAttacksPerTurn":0,"hasFactory":false},{"name":"Augustus Gloop","type":"PlayerType.AUGUSTUS_GLOOP","id":"bb61a18c-cef5-4191-ac55-d246b4eb15c4","cacao":50,"cacaoPerTurn":0,"buildings":0,"buildingsPerTurn":0,"attacks":0,"attacksPerTurn":0,"fruitAttacks":0,"fruitAttacksPerTurn":0,"hotChocolateAttacks":0,"hotChocolateAttacksPerTurn":0,"hasFactory":false}]},{"type":"battlechoc/gameplay/createBoard","payload":{"boardSize":{"rows":8,"cols":8},"boardSeed":42}},{"type":"battlechoc/gameplay/chooseStart","payload":{"issuer":"816741bd-7db0-412e-b53f-6e904275f958"}},{"type":"battlechoc/gameplay/chooseField","payload":{"fieldIdx":0,"issuer":"bb61a18c-cef5-4191-ac55-d246b4eb15c4"}},{"type":"battlechoc/gameplay/build","payload":{"issuer":"816741bd-7db0-412e-b53f-6e904275f958","building":{"id":"554cb054-43b0-4b63-8f4d-f5b4e7be7b60","type":"EntityType.FACTORY","costs":0,"cells":1,"buildingsPerTurn":2,"position":{"row":3,"col":5}}}},{"type":"battlechoc/gameplay/finishTurn","payload":{"issuer":"816741bd-7db0-412e-b53f-6e904275f958"}},{"type":"battlechoc/gameplay/build","payload":{"issuer":"bb61a18c-cef5-4191-ac55-d246b4eb15c4","building":{"id":"49f9d539-0e60-4f9f-9269-4c0137dea06a","type":"EntityType.FACTORY","costs":0,"cells":1,"buildingsPerTurn":2,"position":{"row":3,"col":5}}}},{"type":"battlechoc/gameplay/finishTurn","payload":{"issuer":"bb61a18c-cef5-4191-ac55-d246b4eb15c4"}},{"type":"battlechoc/gameplay/build","payload":{"issuer":"816741bd-7db0-412e-b53f-6e904275f958","building":{"id":"8f83bd13-ae86-4e65-a1c4-e7ad823486e7","type":"EntityType.CACAOTREE","costs":20,"cells":1,"cacaoPerTurn":30,"position":{"row":2,"col":7}}}},{"type":"battlechoc/gameplay/build","payload":{"issuer":"816741bd-7db0-412e-b53f-6e904275f958","building":{"id":"3c575f75-e696-4dcc-afa0-63d272c6b756","type":"EntityType.CACAOTREE","costs":20,"cells":1,"cacaoPerTurn":30,"position":{"row":0,"col":1}}}}]}