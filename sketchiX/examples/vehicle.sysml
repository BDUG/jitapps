// Small SysML v2 structural interchange example for sketchiX.
package VehicleModel {
    port def PowerPort {
        out item energy;
    }
    part def Engine {
        port input : PowerPort;
    }
    part def Vehicle {
        part engine : Engine;
        port supply : PowerPort;
        connect supply to engine.input;
    }
    part car : Vehicle;
    dependency from Vehicle to Engine;
}
