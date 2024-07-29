defmodule WithPhoenix.Repo do
  use Ecto.Repo,
    otp_app: :with_phoenix,
    adapter: Ecto.Adapters.Postgres
end
