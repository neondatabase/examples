import { useShape } from "@electric-sql/react";

function Component() {
  const { data } = useShape({
    url: `http://localhost:3000/v1/shape/foo`,
  });
  return <pre>{JSON.stringify(data, null, 2)}</pre>;
}

export default Component;
