# Digital Banking Backend and API Management Demo

A self-contained banking API demonstration built with Node.js and WSO2 API Manager 4.7.

The repository provides:

* A JavaScript/Node.js banking backend.
* In-memory banking data and workflows.
* Docker packaging for the backend.
* WSO2 API Manager 4.7 running through Docker Compose.
* Eight OpenAPI contracts separated by business context.
* Mock customer, account, card, beneficiary, transfer, remittance, and compliance data.

This repository is intended for local demonstrations, technical workshops, API management evaluations, and integration testing.

## Important notice

This project:

* Uses fictional and simulated data.
* Does not connect to a real core banking system.
* Does not persist backend data after the backend container is restarted.
* Is not intended for production use.
* Should not be exposed directly to the internet.
* Uses local demonstration credentials and self-signed certificates.

The financial rules, limits, exchange rates, customer records, institutions, and transaction data are demonstration values only.

## Architecture

The environment contains two main runtime components:

```text
API consumer
     |
     v
WSO2 API Manager 4.7
     |
     | Docker network
     v
Node.js banking backend
     |
     v
In-memory banking data
```

When both components run through Docker Compose, API Manager reaches the backend using:

```text
http://banking-backend:8080
```

From the host machine, the backend is available at:

```text
http://localhost:8080
```

## Requirements

The complete environment requires:

* Docker
* Docker Compose
* At least 4 CPU cores allocated to Docker
* At least 8 GB of memory allocated to Docker

Node.js is only required when running or testing the backend outside Docker.

## Start the complete environment

Run the following command from the repository root:

```bash
docker compose up --build -d
```

Check the container status:

```bash
docker compose ps
```

Follow all logs:

```bash
docker compose logs -f
```

Follow only the backend logs:

```bash
docker compose logs -f banking-backend
```

Follow only the API Manager logs:

```bash
docker compose logs -f wso2-apim
```

API Manager can take several minutes to complete its first startup.

## Local service addresses

### Banking backend

```text
http://localhost:8080
```

Health endpoint:

```text
http://localhost:8080/health
```

Swagger UI:

```text
http://localhost:8080/docs
```

Aggregate OpenAPI definition:

```text
http://localhost:8080/openapi
```

### WSO2 API Manager

Publisher:

```text
https://localhost:9443/publisher
```

Developer Portal:

```text
https://localhost:9443/devportal
```

Administration Portal:

```text
https://localhost:9443/admin
```

HTTPS Gateway:

```text
https://localhost:8243
```

HTTP Gateway:

```text
http://localhost:8280
```

Default credentials for the local demonstration:

```text
Username: admin
Password: admin
```

The browser may display a certificate warning because the local API Manager environment uses a self-signed certificate.

## Verify the backend

From the host machine:

```bash
curl --fail http://localhost:8080/health
```

Verify that API Manager can reach the backend through the Docker network:

```bash
docker compose exec wso2-apim \
  curl --fail http://banking-backend:8080/health
```

A successful response confirms that both containers are connected correctly.

## Import the APIs into API Manager

Import only the eight YAML files located under:

```text
openapi/apim-import/
```

The importable contracts are:

```text
account-management-api.yaml
beneficiary-management-api.yaml
card-controls-api.yaml
compliance-case-api.yaml
customer-profile-api.yaml
family-remittance-api.yaml
operations-api.yaml
transfer-processing-api.yaml
```

Do not import the following files:

```text
openapi/banking-platform-api.yaml
openapi/context-catalog.json
```

`banking-platform-api.yaml` is the aggregate API definition used for local documentation.

`context-catalog.json` is metadata used to describe the available API contexts. It is not an OpenAPI definition.

### Import procedure

1. Open the API Publisher.
2. Sign in with the local administrator credentials.
3. Create an API by importing an OpenAPI definition.
4. Select one YAML file from `openapi/apim-import/`.
5. Review the generated API resources.
6. Confirm the production endpoint.
7. Create and deploy a revision.
8. Publish the API.
9. Repeat the process for the remaining context contracts.

When API Manager and the backend run through the same Docker Compose environment, the endpoint must remain:

```text
http://banking-backend:8080
```

Do not replace it with `localhost` when API Manager is running inside Docker. Inside the API Manager container, `localhost` refers to API Manager itself.

## Running API Manager outside Docker

When the backend runs through Docker but API Manager runs directly on the host machine, change the production and sandbox endpoint in each imported contract from:

```text
http://banking-backend:8080
```

to:

```text
http://localhost:8080
```

The exact address must match the host port configured for the backend in `docker-compose.yml`.

## Running only the backend

Install the backend dependencies:

```bash
npm --prefix backend ci
```

Run the tests:

```bash
npm --prefix backend test
```

Start the backend:

```bash
npm --prefix backend start
```

The backend will normally be available at:

```text
http://localhost:8080
```

The OpenAPI definitions must remain available to the backend under the repository-level `openapi` directory.

## Stop the environment

Stop the containers while preserving API Manager data:

```bash
docker compose down
```

Start them again:

```bash
docker compose up -d
```

## Reset the complete environment

The following command removes the containers, API Manager database, imported APIs, applications, subscriptions, and Docker volumes:

```bash
docker compose down -v --remove-orphans
```

Recreate the environment:

```bash
docker compose up --build -d
```

This is destructive and should only be used when a complete local reset is required.

## Repository structure

```text
.
├── README.md
├── backend
│   ├── Dockerfile
│   ├── package-lock.json
│   ├── package.json
│   ├── src
│   │   ├── app.js
│   │   ├── config.js
│   │   ├── container.js
│   │   ├── data
│   │   ├── domain
│   │   ├── middleware
│   │   ├── repositories
│   │   ├── routes
│   │   ├── services
│   │   ├── utils
│   │   ├── errors.js
│   │   ├── openapi-registry.js
│   │   └── server.js
│   └── test
│       ├── domain-flows.test.js
│       ├── module-paths.test.js
│       └── money.test.js
├── docker-compose.yml
└── openapi
    ├── apim-import
    │   ├── account-management-api.yaml
    │   ├── beneficiary-management-api.yaml
    │   ├── card-controls-api.yaml
    │   ├── compliance-case-api.yaml
    │   ├── customer-profile-api.yaml
    │   ├── family-remittance-api.yaml
    │   ├── operations-api.yaml
    │   └── transfer-processing-api.yaml
    ├── banking-platform-api.yaml
    └── context-catalog.json
```

## Banking capabilities

The backend demonstrates the following capabilities:

* Customer profile retrieval and maintenance.
* Account portfolio and balance queries.
* Account transaction history.
* Transfer-limit maintenance.
* Beneficiary registration and replacement.
* Card inventory and card controls.
* Internal transfers.
* Domestic clearing transfers.
* High-value transfers.
* Regional transfers.
* Transfer approval and rejection.
* Incoming remittance quotes and registration.
* Remittance review and payout.
* Compliance-case review and resolution.
* Idempotent payment requests.
* Resource versioning using ETags.
* Optimistic concurrency using `If-Match`.
* Correlation identifiers.
* Structured request logging.
* Deterministic in-memory data reset.

The scenario uses GTQ and USD and includes payment and remittance behavior representative of a Central American banking environment.

## Data persistence

The backend uses in-memory storage.

Backend data is reset whenever:

* The backend container is restarted.
* The backend process is restarted.
* The administrative reset operation is executed.

API Manager data is stored in Docker volumes and survives a normal:

```bash
docker compose down
```

API Manager data is deleted by:

```bash
docker compose down -v
```

## Security considerations

This is a demonstration environment.

The backend does not independently enforce production-grade authentication or authorization. API security should be applied through API Manager for the demonstration.

The environment should only be executed on a trusted local machine.

Do not:

* Expose the backend directly to the internet.
* Use the default API Manager credentials in a shared environment.
* Use the mock data as real customer information.
* Treat HTTP headers supplied by clients as trusted user identity.
* Use the in-memory repository as a production datastore.
* Use the bundled self-signed certificates in production.
* Store real credentials, tokens, customer records, or private keys in the repository.

## Troubleshooting

### Backend build cannot find `openapi`

The Docker build context must be the repository root.

The backend service in `docker-compose.yml` should use:

```yaml
build:
  context: .
  dockerfile: backend/Dockerfile
```

The backend Dockerfile should copy the contracts using:

```dockerfile
COPY openapi ./openapi
```

### API Manager returns a backend connection error

Confirm that the imported API endpoint is:

```text
http://banking-backend:8080
```

Verify connectivity:

```bash
docker compose exec wso2-apim \
  curl --fail http://banking-backend:8080/health
```

If the API was previously deployed with an incorrect endpoint, update the endpoint, create a new revision, and deploy that revision to the gateway.

### API Manager reports a duplicated scope

Import only the context-specific contracts under `openapi/apim-import/`.

Do not import the aggregate contract together with the split contracts.

Delete any failed or duplicate API drafts before importing a corrected contract.

### API Manager rejects `context-catalog.json`

This is expected. `context-catalog.json` is not an OpenAPI document and must not be imported.

### Browser reports an untrusted certificate

The local API Manager environment uses a self-signed certificate. The warning is expected for local demonstrations.
