package com.smartcare.ownership;

import java.util.Optional;

public record OwnershipResolution(Optional<String> patientId, boolean unowned, boolean conflict) {

    public static OwnershipResolution owned(String patientId) {
        return new OwnershipResolution(Optional.of(patientId), false, false);
    }

    public static OwnershipResolution notOwned() {
        return new OwnershipResolution(Optional.empty(), true, false);
    }

    public static OwnershipResolution conflicted(String patientId) {
        return new OwnershipResolution(Optional.ofNullable(patientId), false, true);
    }
}
