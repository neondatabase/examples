require("dotenv").config();
const { Sequelize, Model, DataTypes } = require("sequelize");

const sequelize = new Sequelize(process.env.DATABASE_URL);

class User extends Model {}
User.init(
  {
    username: DataTypes.STRING,
    birthday: DataTypes.DATE,
  },
  { sequelize, modelName: "user" }
);

try {
  sequelize.sync().then(() => {
    User.create({
      username: "janedoe",
      birthday: new Date(1980, 6, 20),
    }).then((res) => {
      console.log(res.toJSON());

      process.exit(0);
    });
  });
} catch (error) {
  console.error("Unable to connect to the database:", error);
  process.exit(0);
}
