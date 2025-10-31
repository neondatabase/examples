"""Welcome to Reflex! This file outlines the steps to create a basic app."""

import reflex as rx
from rxconfig import config


class Customer(rx.Model, table=True):
    """The customer model."""

    name: str
    email: str
    phone: str
    address: str


class State(rx.State):
    """The app state."""

    # Form fields
    name: str = ""
    email: str = ""
    phone: str = ""
    address: str = ""

    # List of customers
    customers: list[Customer] = []

    def load_customers(self):
        """Load all customers from the database."""
        with rx.session() as session:
            self.customers = session.exec(Customer.select()).all()

    def add_customer(self):
        """Add a new customer to the database."""
        if self.name and self.email:
            with rx.session() as session:
                customer = Customer(
                    name=self.name,
                    email=self.email,
                    phone=self.phone,
                    address=self.address,
                )
                session.add(customer)
                session.commit()

            # Clear form fields
            self.name = ""
            self.email = ""
            self.phone = ""
            self.address = ""

            # Reload customers
            self.load_customers()

    def delete_customer(self, customer_id: int):
        """Delete a customer from the database."""
        with rx.session() as session:
            customer = session.get(Customer, customer_id)
            if customer:
                session.delete(customer)
                session.commit()

        # Reload customers
        self.load_customers()


def index() -> rx.Component:
    return rx.box(
        rx.color_mode.button(position="top-right"),
        rx.vstack(
            # Header
            rx.heading(
                "Customer Management",
                size="8",
                weight="bold",
                margin_bottom="2rem",
            ),
            # Add Customer Section
            rx.card(
                rx.vstack(
                    rx.heading("➕ Add New Customer", size="5", weight="medium"),
                    rx.grid(
                        rx.input(
                            placeholder="Name *",
                            value=State.name,
                            on_change=State.set_name,
                            size="3",
                        ),
                        rx.input(
                            placeholder="Email *",
                            value=State.email,
                            on_change=State.set_email,
                            size="3",
                        ),
                        rx.input(
                            placeholder="Phone",
                            value=State.phone,
                            on_change=State.set_phone,
                            size="3",
                        ),
                        rx.input(
                            placeholder="Address",
                            value=State.address,
                            on_change=State.set_address,
                            size="3",
                        ),
                        columns="4",
                        spacing="4",
                        width="100%",
                    ),
                    rx.button(
                        "Add Customer",
                        on_click=State.add_customer,
                        size="3",
                        variant="solid",
                        color_scheme="blue",
                        width="auto",
                    ),
                    spacing="4",
                    width="100%",
                ),
                size="3",
                width="100%",
            ),
            # Spreadsheet Table
            rx.card(
                rx.vstack(
                    rx.heading(
                        f"📊 Customer List ({State.customers.length()} total)",
                        size="5",
                        weight="medium",
                    ),
                    rx.box(
                        rx.table.root(
                            rx.table.header(
                                rx.table.row(
                                    rx.table.column_header_cell("ID", width="80px"),
                                    rx.table.column_header_cell("Name"),
                                    rx.table.column_header_cell("Email"),
                                    rx.table.column_header_cell("Phone"),
                                    rx.table.column_header_cell("Address"),
                                    rx.table.column_header_cell(
                                        "Actions", width="120px"
                                    ),
                                ),
                            ),
                            rx.table.body(
                                rx.foreach(
                                    State.customers,
                                    lambda customer, index: rx.table.row(
                                        rx.table.cell(
                                            rx.badge(
                                                customer.id,
                                                color_scheme="gray",
                                                variant="soft",
                                            ),
                                        ),
                                        rx.table.cell(
                                            rx.text(customer.name, weight="medium"),
                                        ),
                                        rx.table.cell(
                                            rx.text(customer.email),
                                        ),
                                        rx.table.cell(
                                            rx.text(customer.phone),
                                        ),
                                        rx.table.cell(
                                            rx.text(customer.address),
                                        ),
                                        rx.table.cell(
                                            rx.button(
                                                rx.icon("trash-2", size=16),
                                                on_click=lambda: State.delete_customer(
                                                    customer.id
                                                ),
                                                size="2",
                                                variant="soft",
                                                color_scheme="red",
                                            ),
                                        ),
                                        align="center",
                                    ),
                                ),
                            ),
                            variant="surface",
                            size="3",
                            width="100%",
                        ),
                        width="100%",
                        overflow_x="auto",
                    ),
                    spacing="4",
                    width="100%",
                ),
                size="3",
                width="100%",
            ),
            spacing="6",
            width="100%",
            max_width="1400px",
            padding="2rem",
        ),
        width="100%",
        display="flex",
        justify_content="center",
        min_height="100vh",
        background="var(--gray-1)",
        on_mount=State.load_customers,
    )


app = rx.App()
app.add_page(index)
