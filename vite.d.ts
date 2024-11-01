declare const _default: (reg?: RegExp) => {
    name: string;
    transform(_: any, id: string): {
        code: string;
        map: null;
    } | undefined;
};
export default _default;
