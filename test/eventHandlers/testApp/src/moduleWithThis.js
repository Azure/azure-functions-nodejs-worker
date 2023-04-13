class FuncObject {
    prop = 'testThisProp';
    constructor() { }
    async test(context) {
        context.log(`This value: "${this.prop}"`);
    }
}

module.exports = new FuncObject();