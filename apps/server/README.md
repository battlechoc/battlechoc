# battlechoc-server
The battlechoc nodejs backend 

## Getting Started

- Setup MongoDB

  ```zsh
  brew update
  brew install mongodb
  mkdir -p /data/db
  sudo chown -R `id -un` /data/db
  mongod # starts the daemon

- Install nodemon
  ```zsh
  sudo npm i -g nodemon
- Run ```npm install``` in battlechoc-server folder
- Use ```nodemon app.js``` to start the dev server on port 3000

## Testing

- Install Postman (https://www.getpostman.com/)
- [POST] localhost:3000/user with body {"name": "test", "password": "1234qwert"} adds a user
- [GET] localhost:3000/users lists all users
