export function modelOptionName(value: string) {
    const separator = "::";
    const index = value.indexOf(separator);
    return index >= 0 ? value.slice(index + separator.length) : value;
}

export function isAgnesImageModel(model: string) {
    return modelOptionName(model).toLowerCase().includes("agnes-image");
}

export function isAgnesVideoModel(model: string) {
    return modelOptionName(model).toLowerCase().includes("agnes-video");
}

export function isAgnesModel(model: string) {
    return isAgnesImageModel(model) || isAgnesVideoModel(model);
}
