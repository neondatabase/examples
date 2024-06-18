# Introduction

The `Elements` and `Elements_ext` tables contain periodic table data. This data is used as sample data in the Neon documentation. See [Use Prisma with Neon](https://neon.tech/docs/guides/prisma-tutorial/).

The `Elements` table has these columns:

- AtomicNumber
- Element
- Symbol
- AtomicMass

The `Elements_ext` table is larger and has these columns:

- AtomicNumber
- Element
- Symbol
- AtomicMass
- NumberOfNeutrons
- NumberOfProtons
- NumberOfElectrons
- Period
- Group
- Phase
- Radioactive
- Natural
- Metal
- Nonmetal
- Metalloid
- Type
- AtomicRadius
- Electronegativity
- FirstIonization
- Density
- MeltingPoint
- BoilingPoint
- NumberOfIsotopes
- Discoverer
- Year
- SpecificHeat
- NumberOfShells
- NumberOfValence

## Installation

### Elements table

1. Download the `elements.sql` and `elements.csv` files

2. Login to Neon with `psql`:

    ```bash
    psql postgres://<user>:<password>@<host>/<dbname>
    ```

    For more information about connecting, see [Connect with psql](https://neon.tech/docs/connect/query-with-psql-editor/).

3. Run the following commands:

    ```bash
    postgres=# \i /path/to/elements.sql
    postgres=# \copy "Elements" FROM '/path/to/elements.csv' DELIMITER ',' CSV
    ```

### Elements_ext table

1. Download the `elements_ext.sql` and `elements_ext.csv` files

2. Login to Neon with `psql`:

    ```bash
    psql postgres://<user>:<password>@<host>/<dbname>
    ```

    For more information about connecting, see [Connect with psql](https://neon.tech/docs/connect/query-with-psql-editor/).

3. Run the following commands:

    ```bash
    postgres=# \i /path/to/elements_ext.sql
    postgres=# \copy "Elements_ext" FROM '/path/to/elements_ext.csv' DELIMITER ',' CSV
    ```

## Acknowledgements

Periodic table data was sourced from the [Goodman Sciences GitHub repository](https://gist.github.com/GoodmanSciences/c2dd862cd38f21b0ad36b8f96b4bf1ee).
