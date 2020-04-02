function fmt(str, values) {
    return str.replace(/\{\{(\w+)\}\}/g, function (match, key) {
        return values[key];
    });
};

export default fmt;