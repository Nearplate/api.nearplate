import { getE2eApp, startE2eApp, stopE2eApp } from "../helpers/app.harness";

beforeAll(async () => {
	await startE2eApp();
}, 60_000);

afterAll(async () => {
	await stopE2eApp();
});

beforeEach(async () => {
	await getE2eApp().reset();
});
