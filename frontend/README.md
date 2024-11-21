# Development

## Adding an NPM Package

You can add a package to `package.json` via your favorite package manager and the next time your Docker container gets built from scratch, it will install that package too.

### Adding to an Existing Docker Container
If you need to add a package to a running Docker container for immediate use, follow these steps:

1. Access the running container:

```sh
docker exec -it pyspur_dev-frontend-1 sh
```

2. Install the package:

```sh
npm install <package_name>
```


3. Restart the container to apply changes:

```sh
docker restart pyspur_dev-frontend-1
```
