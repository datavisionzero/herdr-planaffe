import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { statuses } from "../mods/planaffe/core.js";

const revision = "8280064a515499f00594e706cfdc3c299b81ea00";
const source = `https://raw.githubusercontent.com/datavisionzero/planaffe/${revision}/docs/api/openapi.json`;
let contract;
if (process.argv[2]) contract = JSON.parse(await readFile(process.argv[2], "utf8"));
else {
  const response = await fetch(source, { signal: AbortSignal.timeout(30000) });
  assert.ok(response.ok, `Cannot read the pinned contract: HTTP ${response.status}`);
  contract = await response.json();
}
const schemas = contract.components.schemas;
const schema = ref => schemas[ref.split("/").at(-1)];
const output = path => contract.paths[path].get.responses["200"].content["application/json"].schema;
assert.equal(schema(output("/issues").$ref), schemas.IssuePage);
assert.equal(schema(output("/issues/{key}").$ref), schemas.Issue);
assert.equal(schema(output("/projects/{key}/labels").items.$ref), schemas.Label);
assert.deepEqual(schemas.IssueStatus.enum, statuses);
assert.equal(schemas.IssuePage.properties.items.items.$ref, "#/components/schemas/IssueSummary");
for (const [name, fields] of Object.entries({
  IssuePage: ["items", "total", "has_more", "next_cursor"],
  IssueSummary: ["key", "project", "title", "status", "assignee", "claim", "labels", "open_questions", "epic"],
  Issue: ["key", "project", "title", "status", "assignee", "claim", "labels", "description", "result", "questions", "epic"],
  EpicRef: ["key", "title", "status"],
  Question: ["id", "question", "answer"], AnswerRequest: ["answer"], IdentityRef: ["name"], Claim: ["holder"], Label: ["name", "group"]
})) for (const field of fields) assert.ok(schemas[name].required.includes(field), `${name}.${field} must be present`);
assert.equal(schemas.IssueSummary.properties.labels.items.type, "string");
assert.equal(schemas.Issue.properties.labels.items.$ref, "#/components/schemas/Label");
assert.equal(schemas.Issue.properties.description.type, "string");
assert.equal(schemas.IssueSummary.properties.description, undefined);
assert.deepEqual(schemas.IssueSummary.properties.epic.type, ["null", "string"]);
assert.ok(schemas.Issue.properties.epic.oneOf.some(value => value.$ref === "#/components/schemas/EpicRef"));
assert.deepEqual(schemas.EpicStatus.enum, ["open", "closed"]);
assert.equal(schemas.Claim.properties.holder.$ref, "#/components/schemas/IdentityRef");
assert.ok(schemas.IssueSummary.properties.assignee.oneOf.some(value => value.$ref === "#/components/schemas/IdentityRef"));
const parameters = contract.paths["/issues"].get.parameters.map(value => value.name);
for (const name of ["project", "limit", "sort", "order", "cursor"]) assert.ok(parameters.includes(name));
console.log(`Consumed API contract verified against ${process.argv[2] ? "the supplied document" : revision}.`);

assert.equal(contract.paths["/questions/{id}/answer"].post.requestBody.content["application/json"].schema.$ref, "#/components/schemas/AnswerRequest");
