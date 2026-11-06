// What the tutorial can play, by id (state.ui.loopAnimations): the first lesson, or the demos of
// the buildings. Only the ids: App and the build palette name them, while the lesson, the demos
// and the Tutorial that plays them are loaded on demand (src/ui/onDemand.js).

const LESSON = "TutorialLesson";

const DemoId = Object.freeze({
  FACTORY_EXTENSION: "TutorialDemo.FactoryExtension",
  EASTER_BUNNY: "TutorialDemo.EasterBunny",
  XMAS_FACTORY: "TutorialDemo.XmasFactory",
  HOT_CHOCOLATE_BALLISTA: "TutorialDemo.HotChocolateBallista",
  CHOCOLATE_FOUNTAIN: "TutorialDemo.ChocolateFountain",
  FRUIT_CANNON: "TutorialDemo.FruitCannon",
  DONUT_FACTORY: "TutorialDemo.DonutFactory",
  DONUTS: "TutorialDemo.Donuts",
});

const allDemos = Object.values(DemoId);

export { LESSON, DemoId, allDemos };
