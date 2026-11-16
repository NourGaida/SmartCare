package com.smartcare.ownership;

import com.smartcare.persistence.Measurement;

public interface OwnershipResolver {

    OwnershipResolution resolve(Measurement measurement);
}
