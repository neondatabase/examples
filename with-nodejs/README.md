# Getting started with Neon and NodeJS

Run the below command to copy the `.env.sample` file:

```
cp .env.sample .env && rm .env.sample
```

## Store your Neon credentials

Store your Neon credentials in your `.env` file.

```
PGHOST='<endpoint_hostname>:<port>'
PGDATABASE='<database>'
PGUSER='<username>'
PGPASSWORD='<password>'
ENDPOINT_ID='<endpoint_id>'
```

where:

- `<endpoint_hostname>` the hostname of the branch endpoint, which is found on the Neon **Dashboard**, under **Connection Settings**.
- `<post>` is the Postgres port number. Neon uses port `5432` by default.
- `<database>` is the name of the database in your Neon project. `main` is the default database created with each Neon project.
- `<username>` is the database user, which is found on the Neon Console **Dashboard** tab, under **Connection Details**.
- `<password>` is the database user's password, which is provided to you when you create a project.
- `<endpoint_id>` is the ID of the branch endpoint that you are connecting to, which can be found on the Neon **Dashboard**, under **Connection Settings**. The `<endpoint_id>` starts with an `ep-` prefix, as in this example: `ep-steep-forest-654321`.

**_Important_**: To ensure the security of your data, never expose your Neon credentials to the browser.

Run the below command to install project dependencies:

```
npm install
```

Run the NodeJS application using the following command:

```
node index.js
```

You should expect the following result:

```
Hello Neon
```
