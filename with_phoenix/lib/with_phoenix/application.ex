defmodule WithPhoenix.Application do
  # See https://hexdocs.pm/elixir/Application.html
  # for more information on OTP Applications
  @moduledoc false

  use Application

  @impl true
  def start(_type, _args) do
    children = [
      WithPhoenixWeb.Telemetry,
      WithPhoenix.Repo,
      {DNSCluster, query: Application.get_env(:with_phoenix, :dns_cluster_query) || :ignore},
      {Phoenix.PubSub, name: WithPhoenix.PubSub},
      # Start the Finch HTTP client for sending emails
      {Finch, name: WithPhoenix.Finch},
      # Start a worker by calling: WithPhoenix.Worker.start_link(arg)
      # {WithPhoenix.Worker, arg},
      # Start to serve requests, typically the last entry
      WithPhoenixWeb.Endpoint
    ]

    # See https://hexdocs.pm/elixir/Supervisor.html
    # for other strategies and supported options
    opts = [strategy: :one_for_one, name: WithPhoenix.Supervisor]
    Supervisor.start_link(children, opts)
  end

  # Tell Phoenix to update the endpoint configuration
  # whenever the application is updated.
  @impl true
  def config_change(changed, _new, removed) do
    WithPhoenixWeb.Endpoint.config_change(changed, removed)
    :ok
  end
end
