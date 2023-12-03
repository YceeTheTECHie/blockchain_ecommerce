export interface User {
    email : string,
    password : string
}

export interface UnitUser extends User {
    id : string
}

export interface Users {
    [key : string] : UnitUser
}