export function applyClassMethods(targetClass, methodsClass) {
  Object.getOwnPropertyNames(methodsClass.prototype)
    .filter((name) => name !== 'constructor')
    .forEach((name) => {
      Object.defineProperty(targetClass.prototype, name, Object.getOwnPropertyDescriptor(methodsClass.prototype, name));
    });
}
