const errors = require('../errors');
const shared = require('../index');

test('every rule error names itself in code and name, whatever its class is called', () => {
    for (const [code, ErrorClass] of Object.entries(errors)) {
        expect(ErrorClass.code).toBe(code);
        // a minifier may rename the class: the code must not come from its name
        const Renamed = class extends ErrorClass {};
        Object.defineProperty(Renamed, 'name', { value: 'n' });
        const error = new Renamed({ type: 'x' });
        expect(error.code).toBe(code);
        expect(error.name).toBe(code);
        expect(error).toBeInstanceOf(errors.BattlechocError);
    }
});

test('the package exports every rule error', () => {
    for (const [code, ErrorClass] of Object.entries(errors)) {
        expect(shared[code]).toBe(ErrorClass);
    }
});
