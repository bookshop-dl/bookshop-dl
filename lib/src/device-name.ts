import { faker } from "@faker-js/faker";

function iosDeviceName() {
  const owner = faker.person.firstName();
  const model = faker.helpers.arrayElement([
    "iPhone",
    "iPad",
    "iPad Air",
    "iPad Pro",
  ] as const);

  if (model === "iPhone") {
    const generation = faker.helpers.maybe(
      () => ` ${faker.number.int({ min: 12, max: 16 })}`,
      { probability: 0.7 },
    );
    return `${owner}'s iPhone${generation ?? ""}`;
  }

  return `${owner}'s ${model}`;
}

function androidDeviceName() {
  return faker.helpers.arrayElement([
    () =>
      `Pixel ${faker.number.int({ min: 7, max: 9 })}${faker.helpers.maybe(() => " Pro", { probability: 0.25 }) ?? ""}`,
    () =>
      `Galaxy S${faker.number.int({ min: 22, max: 25 })}${faker.helpers.maybe(() => " Ultra", { probability: 0.2 }) ?? ""}`,
    () => `Galaxy A${faker.number.int({ min: 14, max: 55 })}`,
    () => `OnePlus ${faker.number.int({ min: 11, max: 13 })}`,
    () => `motorola edge ${faker.number.int({ min: 30, max: 50 })}`,
    () =>
      `Nothing Phone (${faker.number.int({ min: 1, max: 2 })})${faker.helpers.maybe(() => "a", { probability: 0.5 }) ?? ""}`,
  ])();
}

export function generateMobileDeviceName() {
  return faker.helpers.arrayElement([iosDeviceName, androidDeviceName])().slice(
    0,
    64,
  );
}
