export default (errorClass, valueOrFunc) => {
    return (error) => {
        if (error instanceof errorClass) {
            if (typeof valueOrFunc === 'function') {
                return Promise.resolve(valueOrFunc(error));
            } else {
                return Promise.resolve(valueOrFunc);
            }
        } else {
            return Promise.reject(error);
        }
    };
};
