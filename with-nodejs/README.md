# Getting started with Neon and NodeJS

Run the below command to copy the `.env.sample` file:

```
cp .env.sample .env && rm .env.sample
```

## Store your Neon credentials

Store your Neon credentials in your `.env` file.

```
PGHOST='<project_name>.cloud.neon.tech:<port>'
PGDATABASE='<database>'
PGUSER='<username>'
PGPASSWORD='<password>'
PROJECT_NAME='<project_name>'
```

where:

- `<project_name>` is the ID of the Neon project, which is found on the Neon Console **Settings** tab, under **General Settings**.
- `<dbname>` is the name of the database in your Neon project. `main` is the default database created with each Neon project.
- `<user>` is the database user, which is found on the Neon Console **Dashboard** tab, under **Connection Details**.
- `<password>` is the database user's password, which is provided to you when you create a project.

**_Important_**: To ensure the security of your data, never expose your Neon credentials to the browser.

Run the below command to install project dependencies:

```
npm install
``

Run the NodeJS application using the following command:

```
node index.js
```

You should expect the following result:

```
Hello Neon
```

